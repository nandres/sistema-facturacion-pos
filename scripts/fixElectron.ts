// Recupera el paquete electron cuando su postinstall (install.js) extrae
// el ZIP de forma incompleta. Síntoma: `npm run dev` falla con
// "Error: Electron uninstall" porque node_modules/electron/path.txt no
// existe y/o node_modules/electron/dist está vacío.
//
// Causa raíz conocida: la lib extract-zip (usada por install.js) a veces
// termina con exit 0 en Windows habiendo extraído solo un subconjunto
// del archivo. Acá usamos el extractor del sistema (Expand-Archive en
// Windows, unzip en macOS/Linux), que es más robusto.
//
// Ejecución: npm run electron:fix
// No requiere conexión: usa el ZIP que ya está en el cache de
// @electron/get; si no está, primero invoca install.js para que lo
// descargue, y después re-extrae con el extractor del sistema.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const ELECTRON_DIR = path.join(PROJECT_ROOT, 'node_modules', 'electron');

type Plataforma = 'win32' | 'darwin' | 'linux';

// Mapea plataforma → ruta relativa del ejecutable dentro de dist/.
// Misma tabla que usa node_modules/electron/install.js (getPlatformPath).
const RUTA_BINARIO: Record<Plataforma, string> = {
  win32: 'electron.exe',
  darwin: 'Electron.app/Contents/MacOS/Electron',
  linux: 'electron',
};

function log(msg: string): void {
  console.log(`[electron:fix] ${msg}`);
}

function fatal(msg: string): never {
  console.error(`[electron:fix] ERROR: ${msg}`);
  process.exit(1);
}

// Ubicación por defecto del cache de @electron/get, consistente con la
// que usa install.js cuando no hay electron_config_cache seteado.
function rootDelCache(plataforma: Plataforma): string {
  const override = process.env.electron_config_cache;
  if (override) return override;
  if (plataforma === 'win32') {
    const local = process.env.LOCALAPPDATA;
    if (!local) fatal('LOCALAPPDATA no está definido — ¿estás corriendo desde un entorno sin Windows shell?');
    return path.join(local, 'electron', 'Cache');
  }
  if (plataforma === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Caches', 'electron');
  }
  return path.join(os.homedir(), '.cache', 'electron');
}

// El cache de @electron/get es <root>/<hash>/<nombreZip>. Recorremos
// los subdirs buscando el ZIP exacto (por nombre incluye versión + plat
// + arch, así que basta con match por nombre de archivo).
function buscarZipCacheado(rootCache: string, nombreZip: string): string | null {
  if (!fs.existsSync(rootCache)) return null;
  const subdirs = fs.readdirSync(rootCache, { withFileTypes: true })
    .filter((d) => d.isDirectory());
  for (const sub of subdirs) {
    const candidato = path.join(rootCache, sub.name, nombreZip);
    if (fs.existsSync(candidato)) return candidato;
  }
  return null;
}

function extraerZip(zipPath: string, destino: string, plataforma: Plataforma): void {
  if (plataforma === 'win32') {
    // Expand-Archive es built-in en PowerShell ≥ 5.1 y maneja paths
    // largos bien. -LiteralPath evita problemas con [ ] en el path.
    const cmd = `Expand-Archive -LiteralPath "${zipPath}" -DestinationPath "${destino}" -Force`;
    const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], {
      stdio: 'inherit',
    });
    if (r.status !== 0) fatal(`Expand-Archive falló (exit ${r.status}).`);
    return;
  }
  // macOS y Linux: unzip está siempre disponible.
  const r = spawnSync('unzip', ['-o', '-q', zipPath, '-d', destino], { stdio: 'inherit' });
  if (r.status !== 0) fatal(`unzip falló (exit ${r.status}). ¿Está instalado?`);
}

// Limpia el directorio dist intentando recuperarse del caso típico en
// Windows donde algún archivo (.dll/.exe) queda lockeado por un proceso
// de Electron que sigue vivo o por antivirus escaneando. Tira un fatal
// con mensaje claro si no puede; el usuario verá qué hacer.
function limpiarDist(distDir: string): void {
  try {
    fs.rmSync(distDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    if (err.code === 'EPERM' || err.code === 'EBUSY') {
      fatal(
        `No se pudo limpiar ${distDir}: hay archivos en uso (${err.code}).\n` +
        `        Cerrá cualquier instancia de Electron / npm run dev / VS Code\n` +
        `        que esté apuntando al proyecto y volvé a correr "npm run electron:fix".`,
      );
    }
    throw e;
  }
  fs.mkdirSync(distDir, { recursive: true });
}

// Heurística para decidir si el dist actual está sano: existe el binario
// esperado, el archivo "version" matchea con la versión instalada del
// paquete, y hay al menos algunos de los archivos accesorios típicos
// (cualquier ausencia indica extracción incompleta).
function distEstaSano(distDir: string, binarioRel: string, version: string): boolean {
  const binario = path.join(distDir, binarioRel);
  if (!fs.existsSync(binario)) return false;

  const versionFile = path.join(distDir, 'version');
  if (!fs.existsSync(versionFile)) return false;
  const versionEnDisco = fs.readFileSync(versionFile, 'utf-8').replace(/^v/, '').trim();
  if (versionEnDisco !== version) return false;

  // El binario por sí solo no alcanza: cuando extract-zip falla solo
  // suele dejar "locales/" o un subconjunto. Verificamos un par de
  // archivos críticos que NUNCA deberían faltar en un dist sano.
  if (process.platform === 'win32') {
    if (!fs.existsSync(path.join(distDir, 'ffmpeg.dll'))) return false;
    if (!fs.existsSync(path.join(distDir, 'resources.pak'))) return false;
  }
  return true;
}

function main(): void {
  if (!fs.existsSync(ELECTRON_DIR)) {
    fatal('node_modules/electron no existe. Corré primero "npm install".');
  }

  const pkg = JSON.parse(
    fs.readFileSync(path.join(ELECTRON_DIR, 'package.json'), 'utf-8'),
  ) as { version: string };
  const version = pkg.version;
  log(`Versión instalada de electron: ${version}`);

  const plataforma = process.platform as Plataforma;
  if (!(plataforma in RUTA_BINARIO)) {
    fatal(`Plataforma no soportada: ${plataforma}`);
  }
  const arch = process.arch;
  const binarioRel = RUTA_BINARIO[plataforma];
  const distDir = path.join(ELECTRON_DIR, 'dist');
  const pathTxt = path.join(ELECTRON_DIR, 'path.txt');

  // Fast path: si el dist ya está sano, solo aseguramos path.txt y
  // salimos. Evita limpiar y re-extraer 170 MB innecesariamente y
  // evita el problema de archivos lockeados cuando solo falta path.txt.
  if (distEstaSano(distDir, binarioRel, version)) {
    log('dist ya está completo y la versión coincide. Verificando path.txt...');
    const pathTxtOk = fs.existsSync(pathTxt) &&
      fs.readFileSync(pathTxt, 'utf-8') === binarioRel;
    if (!pathTxtOk) {
      fs.writeFileSync(pathTxt, binarioRel, { encoding: 'utf-8' });
      log(`path.txt (re)escrito: "${binarioRel}"`);
    } else {
      log('path.txt ya es correcto. No hay nada que reparar.');
    }
    log('Listo. Ya podés correr "npm run dev".');
    return;
  }

  log('dist incompleto o desactualizado. Re-extrayendo desde cache...');

  // Nombre del ZIP en cache: convención de @electron/get.
  const nombreZip = `electron-v${version}-${plataforma}-${arch}.zip`;
  const rootCache = rootDelCache(plataforma);
  log(`Buscando ${nombreZip} en ${rootCache}`);

  let zipPath = buscarZipCacheado(rootCache, nombreZip);

  if (!zipPath) {
    log('ZIP no está en cache. Forzando descarga vía install.js...');
    // install.js puede fallar al extraer (es el motivo por el que existe
    // este script), pero el download al cache suele completarse igual.
    spawnSync('node', [path.join(ELECTRON_DIR, 'install.js')], {
      stdio: 'inherit',
      cwd: PROJECT_ROOT,
    });
    zipPath = buscarZipCacheado(rootCache, nombreZip);
    if (!zipPath) {
      fatal(`No se pudo obtener ${nombreZip} ni desde cache ni descargándolo.`);
    }
  }
  log(`ZIP localizado: ${zipPath}`);

  log(`Limpiando ${distDir}`);
  limpiarDist(distDir);

  log('Extrayendo con extractor del sistema operativo...');
  extraerZip(zipPath, distDir, plataforma);

  // install.js mueve electron.d.ts del dist/ al root del paquete si
  // viene incluido en el ZIP. Replicamos ese paso para mantener parity.
  const dtsEnDist = path.join(distDir, 'electron.d.ts');
  if (fs.existsSync(dtsEnDist)) {
    fs.renameSync(dtsEnDist, path.join(ELECTRON_DIR, 'electron.d.ts'));
    log('electron.d.ts movido al root del paquete');
  }

  fs.writeFileSync(pathTxt, binarioRel, { encoding: 'utf-8' });
  log(`path.txt escrito: "${binarioRel}"`);

  const binarioAbs = path.join(distDir, binarioRel);
  if (!fs.existsSync(binarioAbs)) {
    fatal(`El binario esperado no quedó en ${binarioAbs}. La extracción no funcionó.`);
  }
  const sizeMB = (fs.statSync(binarioAbs).size / 1024 / 1024).toFixed(2);
  log(`OK: ${binarioAbs} (${sizeMB} MB)`);
  log('Listo. Ya podés correr "npm run dev".');
}

main();
