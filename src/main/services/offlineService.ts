import Store from 'electron-store';
import { obtenerClienteSupabase } from './supabaseClient';
import type { Producto } from '../../shared/types/productos';
import type { VentaInput, VentaPendiente, VentaFallida } from '../../shared/types/ventas';

// Los dos tipos viven en shared porque el renderer también los consume: la
// pantalla de ventas fallidas los muestra. Estaban declarados acá y otra vez
// en shared, y dos copias de la misma forma terminan divergiendo.
export type { VentaPendiente, VentaFallida };

interface CacheData {
  productos: Producto[];
  ultimaActualizacion: string | null;
  ventasPendientes: VentaPendiente[];
  /**
   * Las que agotaron los reintentos. NO se borran: son ventas que el comercio
   * ya cobró y cuya mercadería ya salió del local. Quedan acá para poder
   * cargarlas a mano.
   */
  ventasFallidas: VentaFallida[];
  carrito_recuperacion?: Record<string, unknown>;
}

const store = new Store<CacheData>({
  name: 'offline-cache',
  defaults: {
    productos: [],
    ultimaActualizacion: null,
    ventasPendientes: [],
    ventasFallidas: [],
  },
});

const TIMEOUT_CONEXION = 5000;
const MAX_INTENTOS = 5;

// Cada cuanto se refresca el catalogo local. El cache es el respaldo para
// trabajar sin conexion: si nunca se refresca, la caja termina operando con
// precios y stock del dia que se instalo el sistema.
const TTL_CACHE_MS = 10 * 60 * 1000;

export async function verificarConexion(): Promise<boolean> {
  const url = process.env.SUPABASE_URL;
  if (!url) return false;
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), TIMEOUT_CONEXION);
    const res = await fetch(`${url}/rest/v1/`, {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(id);
    // Un 5xx significa que Supabase esta caido: hay red, pero no hay servicio,
    // y la venta tiene que irse a la cola offline igual. 401/404 en cambio son
    // respuestas validas del endpoint (no mandamos apikey en el HEAD).
    return res.status < 500;
  } catch {
    return false;
  }
}

export function cacheVencido(): boolean {
  if (store.get('productos').length === 0) return true;
  const ultima = store.get('ultimaActualizacion');
  if (!ultima) return true;
  const edad = Date.now() - new Date(ultima).getTime();
  return !Number.isFinite(edad) || edad > TTL_CACHE_MS;
}

export async function cacheProductos(force = false): Promise<void> {
  if (!force && !cacheVencido()) return;
  try {
    const supabase = obtenerClienteSupabase();
    // Solo productos activos: los dados de baja no deben aparecer en caja.
    const { data, error } = await supabase.from('productos').select('*').eq('activo', true);
    if (error) throw error;
    if (data) {
      store.set('productos', data as Producto[]);
      store.set('ultimaActualizacion', new Date().toISOString());
    }
  } catch (err) {
    console.error('[offlineService.cacheProductos]', err);
  }
}

export function getProductoCache(codigoBarras: string): Producto | null {
  return store.get('productos').find((p) => p.codigo_barras === codigoBarras) ?? null;
}

// Busqueda dentro del cache local. Es el respaldo cuando no hay conexion; la
// busqueda normal de caja va contra la base (productoService.buscarProductos).
export function buscarProductosCache(query: string): Producto[] {
  const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return store.get('productos')
    .filter((p) => {
      const nombre = p.nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return nombre.includes(q) || p.codigo_barras.includes(q);
    })
    .slice(0, 5);
}

export function guardarVentaOffline(input: VentaInput): VentaPendiente {
  const idTemp = crypto.randomUUID();
  const pendiente: VentaPendiente = {
    idTemp,
    payload: {
      ...input,
      // La referencia se estampa al encolar, no al sincronizar: así viaja
      // igual en el primer intento y en el quinto. Es lo que impide que una
      // respuesta perdida --la transacción se confirmó, la respuesta no
      // volvió-- termine registrando la venta dos veces.
      // Ver 20260901000001_venta_idempotente.sql.
      cabecera: { ...input.cabecera, referencia_externa: idTemp },
    },
    fecha: new Date().toISOString(),
    intentos: 0,
  };
  const pendientes = store.get('ventasPendientes');
  pendientes.push(pendiente);
  store.set('ventasPendientes', pendientes);
  return pendiente;
}

export function getVentasPendientes(): VentaPendiente[] {
  return store.get('ventasPendientes');
}

export function hayVentasPendientes(): boolean {
  return store.get('ventasPendientes').length > 0;
}

/** Las que agotaron reintentos y hay que cargar a mano. */
export function getVentasFallidas(): VentaFallida[] {
  return store.get('ventasFallidas');
}

/** Para descartarlas una vez cargadas a mano. */
export function olvidarVentaFallida(idTemp: string): void {
  store.set('ventasFallidas', store.get('ventasFallidas').filter((v) => v.idTemp !== idTemp));
}

export async function eliminarVentaPendiente(idTemp: string): Promise<void> {
  const pendientes = store.get('ventasPendientes').filter((v) => v.idTemp !== idTemp);
  store.set('ventasPendientes', pendientes);
}

export async function sincronizarVentasPendientes(registrarVentaFn: (input: VentaInput) => Promise<unknown>): Promise<{ sincronizadas: number; fallaron: number }> {
  const pendientes = store.get('ventasPendientes');
  let sincronizadas = 0;
  let fallaron = 0;

  for (const pendiente of pendientes) {
    try {
      await registrarVentaFn(pendiente.payload);
      await eliminarVentaPendiente(pendiente.idTemp);
      sincronizadas++;
    } catch (err) {
      pendiente.intentos++;
      console.error(`[offlineService] venta ${pendiente.idTemp} falló (intento ${pendiente.intentos})`, err);
      const todas = store.get('ventasPendientes');
      const idx = todas.findIndex((v) => v.idTemp === pendiente.idTemp);
      if (idx >= 0) {
        todas[idx].intentos = pendiente.intentos;
        store.set('ventasPendientes', todas);
      }
      if (pendiente.intentos >= MAX_INTENTOS) {
        // Sale de la cola, pero NO se borra: se archiva con el motivo.
        //
        // Antes se eliminaba y se perdía para siempre. Es una venta que el
        // comercio ya cobró y cuya mercadería ya salió del local; que el
        // sistema la descarte en silencio porque la base no contestó cinco
        // veces es la peor forma de resolverlo. Muchos de estos fallos son
        // permanentes --stock que otra caja ya vendió, un producto dado de
        // baja--, y reintentar no los arregla: hay que mirarlos.
        const fallida: VentaFallida = {
          ...pendiente,
          ultimoError: err instanceof Error ? err.message : String(err),
          descartadaEn: new Date().toISOString(),
        };
        store.set('ventasFallidas', [...store.get('ventasFallidas'), fallida]);
        await eliminarVentaPendiente(pendiente.idTemp);
        fallaron++;
      }
    }
  }

  return { sincronizadas, fallaron };
}

const CARRITO_KEY = 'carrito_recuperacion';

export function guardarCarritoUI(data: unknown): void {
  store.set(CARRITO_KEY, { ...(data as Record<string, unknown>), timestamp: Date.now() });
}

export function recuperarCarritoUI(): unknown | null {
  const saved = store.get(CARRITO_KEY);
  if (!saved) return null;
  const s = saved as { timestamp?: number };
  if (s.timestamp && Date.now() - s.timestamp > 86400000) {
    store.delete(CARRITO_KEY);
    return null;
  }
  // No se borra al leer: si la app vuelve a cerrarse durante la recuperacion,
  // el carrito tiene que seguir ahi. Se limpia cuando la venta se cobra o se
  // cancela, que es cuando el renderer guarda un carrito vacio.
  return saved;
}
