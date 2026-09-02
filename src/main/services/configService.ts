import Store from 'electron-store';
import { spawn } from 'child_process';
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
}

const store = new Store<ConfigData>({
  name: 'config',
  defaults: {
    impresoraNombre: process.env.TICKETERA_NOMBRE || null,
    impresoraPuerto: null,
    // El .env siembra la primera vez, para que una caja recien instalada
    // arranque con los datos puestos. Despues manda lo que haya en el store.
    comercioNombre: process.env.COMERCIO_NOMBRE || COMERCIO_DEFECTO.nombre,
    comercioRuc: process.env.COMERCIO_RUC || COMERCIO_DEFECTO.ruc,
  },
});

export function obtenerComercio(): Comercio {
  return {
    nombre: store.get('comercioNombre') || COMERCIO_DEFECTO.nombre,
    ruc: store.get('comercioRuc') ?? COMERCIO_DEFECTO.ruc,
  };
}

export function guardarComercio(datos: Comercio): Comercio {
  // El nombre no puede quedar vacio: es lo que encabeza el comprobante.
  const nombre = datos.nombre.trim() || COMERCIO_DEFECTO.nombre;
  store.set('comercioNombre', nombre);
  store.set('comercioRuc', datos.ruc.trim());
  return obtenerComercio();
}

export function obtenerImpresoraConfig(): string | null {
  return store.get('impresoraNombre') || process.env.TICKETERA_NOMBRE || null;
}

export function guardarImpresoraConfig(nombre: string): void {
  const anterior = store.get('impresoraNombre');
  store.set('impresoraNombre', nombre);
  cacheImpresoras = null; // invalidar caché
  // Otra impresora es, casi seguro, otro puerto.
  if (anterior !== nombre) olvidarPuertoImpresora();
}

export function obtenerPuertoImpresoraCache(): string | null {
  return store.get('impresoraPuerto') || null;
}

export function recordarPuertoImpresora(puerto: string): void {
  if (store.get('impresoraPuerto') !== puerto) store.set('impresoraPuerto', puerto);
}

export function olvidarPuertoImpresora(): void {
  store.set('impresoraPuerto', null);
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
