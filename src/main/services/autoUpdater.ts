import { app } from 'electron';
import { createWriteStream, createReadStream, rmSync } from 'node:fs';
import { join } from 'node:path';
import { get } from 'node:https';
import type { IncomingMessage } from 'node:http';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { log } from './logger';

/**
 * Actualizador.
 *
 * Este modulo descarga un ejecutable de internet y lo corre con privilegios de
 * instalacion en cada caja. Es, por lejos, la superficie mas peligrosa del
 * sistema: quien controle lo que devuelve el feed controla las terminales.
 * Por eso todo lo de abajo esta cerrado por defecto.
 *
 * Reglas, y por que:
 *
 *  1. **Solo https y solo hosts de la lista.** Se valida el feed, se valida la
 *     URL del instalador y se valida cada salto de redireccion. Un redirect a
 *     un host cualquiera es lo mismo que no validar nada.
 *  2. **El sha256 es obligatorio.** Antes estaba declarado en la interfaz y no
 *     se verificaba nunca: se ejecutaba lo que viniera. Si el feed no trae
 *     hash, o no coincide, el archivo se borra y no se ejecuta.
 *  3. **El renderer no elige la URL.** Antes `actualizar:descargar` recibia una
 *     URL desde la pantalla y la bajaba y ejecutaba tal cual: cualquier cosa
 *     que lograra hablarle al IPC tenia ejecucion remota. Ahora la funcion
 *     vuelve a leer el feed y usa la URL de ahi.
 *  4. **execFile, no exec.** El nombre del archivo sale de `version`, que viene
 *     de un JSON remoto. Con `exec` y una version tipo `1.0" & calc & "`, eso
 *     era inyeccion de comandos. Ademas la version se sanea para el path.
 */

const HOSTS_CONFIABLES = new Set([
  'raw.githubusercontent.com',
  'github.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
]);

const UPDATE_URL = process.env.UPDATE_URL
  || 'https://raw.githubusercontent.com/nandres/sistema-facturacion/main/version.json';

const MAX_REDIRECCIONES = 5;
const MAX_FEED_BYTES = 64 * 1024;
const MAX_INSTALADOR_BYTES = 300 * 1024 * 1024;

interface VersionInfo {
  version: string;
  url: string;
  sha256?: string;
  changelog?: string;
}

export interface ActualizacionDisponible {
  disponible: boolean;
  version: string;
  url: string;
  changelog?: string;
}

// https obligatorio y host en la lista. El env UPDATE_URL pasa por el mismo
// filtro: una variable de entorno no es razon para bajar la guardia.
function urlConfiable(url: string): URL | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') {
    log.error(`[autoUpdater] URL rechazada, no es https: ${u.protocol}//${u.host}`);
    return null;
  }
  if (!HOSTS_CONFIABLES.has(u.hostname)) {
    log.error(`[autoUpdater] URL rechazada, host no confiable: ${u.hostname}`);
    return null;
  }
  return u;
}

// GET con https, siguiendo redirecciones pero revalidando el host en cada
// salto, con corte de estado y de tamano.
function pedir(url: string, maxBytes: number, saltos = 0): Promise<IncomingMessage | null> {
  return new Promise((resolve) => {
    const u = urlConfiable(url);
    if (!u) { resolve(null); return; }

    get(u, (res) => {
      const estado = res.statusCode ?? 0;

      if (estado >= 300 && estado < 400 && res.headers.location) {
        res.resume();
        if (saltos >= MAX_REDIRECCIONES) {
          log.error('[autoUpdater] demasiadas redirecciones');
          resolve(null);
          return;
        }
        const destino = new URL(res.headers.location, u).toString();
        resolve(pedir(destino, maxBytes, saltos + 1));
        return;
      }

      if (estado !== 200) {
        // Sin esto, el cuerpo de un 404 se guardaba como .exe y se ejecutaba.
        log.error(`[autoUpdater] respuesta ${estado} para ${u.hostname}${u.pathname}`);
        res.resume();
        resolve(null);
        return;
      }

      const largo = Number(res.headers['content-length'] ?? 0);
      if (largo > maxBytes) {
        log.error(`[autoUpdater] respuesta demasiado grande: ${largo} > ${maxBytes}`);
        res.resume();
        resolve(null);
        return;
      }

      resolve(res);
    }).on('error', (err) => {
      log.error('[autoUpdater] error de red:', err);
      resolve(null);
    });
  });
}

async function fetchVersionInfo(): Promise<VersionInfo | null> {
  const res = await pedir(UPDATE_URL, MAX_FEED_BYTES);
  if (!res) return null;

  return new Promise((resolve) => {
    let data = '';
    let bytes = 0;
    res.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_FEED_BYTES) { res.destroy(); resolve(null); return; }
      data += chunk.toString('utf-8');
    });
    res.on('end', () => {
      try {
        const info = JSON.parse(data) as VersionInfo;
        if (typeof info?.version !== 'string' || typeof info?.url !== 'string') {
          log.error('[autoUpdater] feed sin version o sin url');
          resolve(null);
          return;
        }
        resolve(info);
      } catch {
        log.error('[autoUpdater] feed no es JSON válido');
        resolve(null);
      }
    });
    res.on('error', () => resolve(null));
  });
}

export async function checkForUpdates(): Promise<ActualizacionDisponible | null> {
  try {
    const info = await fetchVersionInfo();
    if (!info) return null;

    const actual = app.getVersion();
    if (compararVersiones(info.version, actual) <= 0) {
      log.info(`[autoUpdater] Ya está en la última versión (${actual})`);
      return null;
    }

    log.info(`[autoUpdater] Nueva versión disponible: ${info.version} (actual: ${actual})`);
    return { disponible: true, version: info.version, url: info.url, changelog: info.changelog };
  } catch (err) {
    log.error('[autoUpdater] Error al buscar actualización:', err);
    return null;
  }
}

// Solo digitos, puntos y guiones: es lo que va a formar parte de un nombre de
// archivo que despues se ejecuta.
function versionSegura(version: string): string {
  return version.replace(/[^0-9A-Za-z.\-_]/g, '').slice(0, 32) || 'desconocida';
}

function sha256DeArchivo(ruta: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    createReadStream(ruta)
      .on('data', (c) => hash.update(c))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

async function descargarArchivo(url: string, dest: string): Promise<boolean> {
  const res = await pedir(url, MAX_INSTALADOR_BYTES);
  if (!res) return false;

  return new Promise((resolve) => {
    const file = createWriteStream(dest);
    let bytes = 0;
    let excedido = false;

    res.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_INSTALADOR_BYTES && !excedido) {
        excedido = true;
        log.error('[autoUpdater] el instalador excede el tamaño máximo');
        res.destroy();
        file.destroy();
        resolve(false);
      }
    });
    res.pipe(file);
    file.on('finish', () => { file.close(() => resolve(!excedido)); });
    file.on('error', (err) => { log.error('[autoUpdater] error al escribir:', err); resolve(false); });
    res.on('error', () => resolve(false));
  });
}

function borrarSilencioso(ruta: string): void {
  try { rmSync(ruta, { force: true }); } catch { /* nada que hacer */ }
}

/**
 * Descarga e instala la última versión.
 *
 * No recibe la URL: la vuelve a leer del feed. Quien llama solo expresa la
 * intención de actualizar; qué se baja lo decide este módulo.
 */
export async function descargarEInstalar(): Promise<boolean> {
  let destPath = '';
  try {
    const info = await fetchVersionInfo();
    if (!info) return false;

    if (compararVersiones(info.version, app.getVersion()) <= 0) {
      log.info('[autoUpdater] no hay versión más nueva que instalar');
      return false;
    }

    if (!urlConfiable(info.url)) return false;

    if (!info.sha256 || !/^[a-f0-9]{64}$/i.test(info.sha256)) {
      // Sin hash no se ejecuta nada. Preferimos no actualizar antes que
      // ejecutar un binario que no podemos verificar.
      log.error('[autoUpdater] el feed no trae un sha256 válido; se aborta');
      return false;
    }

    destPath = join(app.getPath('temp'), `sistema-facturacion-${versionSegura(info.version)}.exe`);
    log.info(`[autoUpdater] Descargando ${info.url} → ${destPath}`);
    if (!await descargarArchivo(info.url, destPath)) {
      borrarSilencioso(destPath);
      return false;
    }

    const hash = await sha256DeArchivo(destPath);
    if (hash.toLowerCase() !== info.sha256.toLowerCase()) {
      log.error(`[autoUpdater] sha256 no coincide. esperado=${info.sha256} obtenido=${hash}`);
      borrarSilencioso(destPath);
      return false;
    }
    log.info('[autoUpdater] sha256 verificado, ejecutando installer');

    // execFile: el path va como argumento, no como pedazo de una linea de
    // comandos que un shell vuelve a interpretar.
    execFile(destPath, ['/S'], (err) => {
      if (err) log.error('[autoUpdater] Error al ejecutar installer:', err);
      else app.quit();
    });

    return true;
  } catch (err) {
    log.error('[autoUpdater] Error al descargar/instalar:', err);
    if (destPath) borrarSilencioso(destPath);
    return false;
  }
}

function compararVersiones(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const va = pa[i] || 0;
    const vb = pb[i] || 0;
    if (va !== vb) return va - vb;
  }
  return 0;
}
