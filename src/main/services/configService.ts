import Store from 'electron-store';
import { safeStorage } from 'electron';
import { spawn } from 'child_process';
import { pistaDeClave, urlValida, type Conexion, type EstadoConexion } from '../../shared/config/conexion';
import { log } from './logger';
import { COMERCIO_DEFECTO, type Comercio } from '../../shared/config/comercio';

interface ConfigData {
  impresoraNombre: string | null;
  // Puerto por el que la ticketera contesto la ultima vez (USB001, LPT1...).
  // Persiste entre arranques: el puerto de una impresora USB fija no cambia,
  // y buscarlo de nuevo cuesta hasta doce arranques de PowerShell por venta.
  impresoraPuerto: string | null;
  // Datos del comercio. Viven acá --por instalacion-- y no en el codigo: es lo
  // que permite que un mismo instalador sirva para cualquier cliente en vez de
  // recompilar cambiando el RUC a mano.
  comercioNombre: string;
  comercioRuc: string;
  // Conexion al proyecto Supabase del comercio. Vive aca por el mismo
  // motivo que el RUC: un instalador tiene que servir para cualquier
  // cliente. Las claves van cifradas si el sistema operativo puede.
  supabaseUrl: string;
  supabaseServiceKey: string;
  supabaseAnonKey: string;
  clavesCifradas: boolean;
}

// El store se crea al primer uso, no al importar el modulo.
//
// `new Store()` toca el disco y pide `app.getPath('userData')`, o sea que
// necesita a Electron vivo. Mientras eso pasaba al importar, cualquier archivo
// que llegara hasta aca por la cadena de imports --`ventaService` ->
// `supabaseClient` -> `configService`-- arrastraba ese efecto, y las pruebas
// que solo querian un tipo de error terminaban necesitando Electron.
let instancia: Store<ConfigData> | null = null;

function store(): Store<ConfigData> {
  if (instancia) return instancia;
  instancia = new Store<ConfigData>({
    name: 'config',
    defaults: {
      impresoraNombre: process.env.TICKETERA_NOMBRE || null,
      impresoraPuerto: null,
      // El .env siembra la primera vez, para que una caja recien instalada
      // arranque con los datos puestos. Despues manda lo que haya en el store.
      comercioNombre: process.env.COMERCIO_NOMBRE || COMERCIO_DEFECTO.nombre,
      comercioRuc: process.env.COMERCIO_RUC || COMERCIO_DEFECTO.ruc,
      // El .env siembra la conexion la primera vez igual que al comercio, asi
      // que una instalacion que ya venia andando no nota el cambio. Lo que se
      // guarda aca despues manda sobre el .env.
      supabaseUrl: process.env.SUPABASE_URL || '',
      supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
      // Lo sembrado del .env entra en claro; se cifra al primer guardado.
      clavesCifradas: false,
    },
  });
  return instancia;
}

export function obtenerComercio(): Comercio {
  return {
    nombre: store().get('comercioNombre') || COMERCIO_DEFECTO.nombre,
    ruc: store().get('comercioRuc') ?? COMERCIO_DEFECTO.ruc,
  };
}

export function guardarComercio(datos: Comercio): Comercio {
  // El nombre no puede quedar vacio: es lo que encabeza el comprobante.
  const nombre = datos.nombre.trim() || COMERCIO_DEFECTO.nombre;
  store().set('comercioNombre', nombre);
  store().set('comercioRuc', datos.ruc.trim());
  return obtenerComercio();
}

// ── Conexión al proyecto Supabase ──────────────────────────────────────────
//
// Las claves se cifran con el almacén del sistema operativo cuando lo hay
// (DPAPI en Windows, que es donde corre esto). Si no lo hay se guardan en
// claro y queda constancia en el log: es exactamente lo que pasaba con el
// `.env`, así que no se pierde nada, pero conviene que se sepa.

function hayCifrado(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

function descifrar(dato: string): string {
  if (!dato) return '';
  try {
    return safeStorage.decryptString(Buffer.from(dato, 'base64'));
  } catch {
    // Pasa si cambió el perfil de Windows: DPAPI ata el cifrado al usuario.
    // Devolver vacío manda a la pantalla de configuración, que es mejor que
    // arrancar con una clave rota y descubrirlo en la primera consulta.
    log.error('[config] no se pudo descifrar la clave guardada; hay que cargarla de nuevo');
    return '';
  }
}

export function obtenerConexion(): Conexion {
  const cifradas = store().get('clavesCifradas') === true;
  const leer = (v: string): string => (cifradas ? descifrar(v) : v);
  return {
    url: store().get('supabaseUrl') || '',
    serviceRoleKey: leer(store().get('supabaseServiceKey') || ''),
    anonKey: leer(store().get('supabaseAnonKey') || ''),
  };
}

export function guardarConexion(datos: Conexion): Conexion {
  const cifra = hayCifrado();
  const guardar = (v: string): string => {
    const limpio = v.trim();
    if (!limpio) return '';
    return cifra ? safeStorage.encryptString(limpio).toString('base64') : limpio;
  };

  store().set('supabaseUrl', datos.url.trim());
  store().set('supabaseServiceKey', guardar(datos.serviceRoleKey));
  store().set('supabaseAnonKey', guardar(datos.anonKey));
  store().set('clavesCifradas', cifra);

  if (!cifra) {
    log.warn('[config] el sistema no ofrece cifrado: las claves quedan en texto plano');
  }

  return obtenerConexion();
}

/**
 * Si esta instalación puede hablar con la base.
 *
 * La `anon key` no entra en la cuenta a propósito: es opcional, y su ausencia
 * sólo significa que el login por cajero todavía no está encendido.
 */
export function hayConexion(): boolean {
  const c = obtenerConexion();
  return urlValida(c.url) && c.serviceRoleKey.length > 0;
}

/** Lo que puede ver la pantalla. Las claves no salen de acá. */
export function estadoConexion(): EstadoConexion {
  const c = obtenerConexion();
  return {
    configurada: hayConexion(),
    url: c.url,
    serviceRoleKeyPista: pistaDeClave(c.serviceRoleKey),
    anonKeyPista: pistaDeClave(c.anonKey),
    cifrada: store().get('clavesCifradas') === true,
  };
}

export function obtenerImpresoraConfig(): string | null {
  return store().get('impresoraNombre') || process.env.TICKETERA_NOMBRE || null;
}

export function guardarImpresoraConfig(nombre: string): void {
  const anterior = store().get('impresoraNombre');
  store().set('impresoraNombre', nombre);
  cacheImpresoras = null; // invalidar caché
  // Otra impresora es, casi seguro, otro puerto.
  if (anterior !== nombre) olvidarPuertoImpresora();
}

export function obtenerPuertoImpresoraCache(): string | null {
  return store().get('impresoraPuerto') || null;
}

export function recordarPuertoImpresora(puerto: string): void {
  if (store().get('impresoraPuerto') !== puerto) store().set('impresoraPuerto', puerto);
}

export function olvidarPuertoImpresora(): void {
  store().set('impresoraPuerto', null);
}

function ejecutarPS(comando: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const ps = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', comando]);
    let out = '', err = '';
    ps.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    ps.stderr.on('data', (d: Buffer) => { err += d.toString(); });
    ps.on('close', (code) => {
      if (code === 0) resolve(out.trim().split('\n').map(s => s.trim()).filter(Boolean));
      else reject(err);
    });
    ps.on('error', reject);
  });
}

let cacheImpresoras: string[] | null = null;

export async function listarImpresoras(): Promise<string[]> {
  if (cacheImpresoras) return cacheImpresoras;
  for (const cmd of [
    'Get-Printer | Select-Object -ExpandProperty Name',
    'Get-CimInstance Win32_Printer | Select-Object -ExpandProperty Name',
  ]) {
    try {
      cacheImpresoras = await ejecutarPS(cmd);
      if (cacheImpresoras.length > 0) return cacheImpresoras;
    } catch { /* siguiente */ }
  }
  return [];
}
