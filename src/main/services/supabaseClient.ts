import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import ws from 'ws';
import { log } from './logger';

/**
 * Punto de entrada único al acceso a datos.
 *
 * Los 21 servicios del proceso main piden el cliente por acá, así que este
 * archivo es el único lugar donde se decide *con qué identidad* se habla con
 * la base. Eso es lo que hace posible el cambio de C-01 sin tocarlos: si acá
 * se devuelve un cliente con el token del cajero, todos pasan a operar con ese
 * token.
 *
 * ── EL PROBLEMA QUE SE ESTÁ CERRANDO ──────────────────────────────────────
 *
 * Hasta ahora todo salía con la `service_role` key, que viaja dentro del
 * instalador (`build.extraResources` empaqueta el `.env`). Ese rol tiene
 * BYPASSRLS: ninguna de las políticas de C-02 lo frena. Cualquiera con acceso
 * a una PC de caja obtiene control total del proyecto.
 *
 * ── CÓMO SE ELIGE LA IDENTIDAD ────────────────────────────────────────────
 *
 * 1. Si hay una sesión iniciada (el cajero entró y Supabase Auth le dio un
 *    token), se usa el cliente de esa sesión. Es el camino nuevo.
 * 2. Si no, se usa `service_role`. Es el camino de siempre.
 *
 * El punto 2 es la vuelta atrás, y está a propósito: durante la transición la
 * caja tiene que seguir vendiendo aunque el login nuevo falle. Cuando el
 * camino nuevo esté probado en el mostrador, se saca el fallback y recién ahí
 * la key sale del instalador.
 */

let clienteServicio: SupabaseClient | null = null;
let clienteSesion: SupabaseClient | null = null;

/** Cómo se está hablando con la base ahora mismo. Para diagnóstico y logs. */
export type ModoAcceso = 'sesion' | 'service_role';

function url(): string {
  const u = process.env.SUPABASE_URL;
  if (!u || u === 'tu_url_aqui') {
    throw new Error('SUPABASE_URL no está configurada. Revisá el archivo .env en la raíz del proyecto.');
  }
  return u;
}

const opcionesComunes = {
  auth: { persistSession: false as const },
  realtime: { transport: ws as unknown as never },
};

function crearClienteServicio(): SupabaseClient {
  if (clienteServicio) return clienteServicio;

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey || serviceRoleKey === 'tu_clave_service_role_aqui') {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY no está configurada. Revisá el archivo .env en la raíz del proyecto.');
  }

  clienteServicio = createClient(url(), serviceRoleKey, opcionesComunes);
  return clienteServicio;
}

/**
 * El cliente que usan todos los servicios.
 *
 * Devuelve el de la sesión del cajero si hay una; si no, el de service_role.
 * Ningún servicio necesita saber cuál le tocó.
 */
export function obtenerClienteSupabase(): SupabaseClient {
  return clienteSesion ?? crearClienteServicio();
}

/** Con qué identidad se está operando. */
export function modoAcceso(): ModoAcceso {
  return clienteSesion ? 'sesion' : 'service_role';
}

/**
 * El email con el que un empleado entra a Supabase Auth.
 *
 * Se compone del nombre porque los cajeros no tienen correo. Tiene que dar
 * exactamente lo mismo que `public.email_de_usuario()` en la base: si las dos
 * expresiones divergen, el login deja de encontrar al usuario.
 */
export function emailDeUsuario(nombre: string): string {
  return `${nombre.trim().replace(/[^A-Za-z0-9]+/g, '.').toLowerCase()}@caja.local`;
}

export interface SesionCajero {
  idUsuario: number;
  nombreEmpleado: string;
  rol: string;
}

/**
 * Inicia sesión contra Supabase Auth y deja el cliente listo para operar con
 * ese token.
 *
 * Devuelve `null` si las credenciales no entran por este camino —contraseña
 * equivocada, o un usuario que todavía no tiene identidad migrada—. El
 * llamador decide si cae al login viejo; acá no se decide esa política.
 */
export async function iniciarSesion(nombre: string, password: string): Promise<SesionCajero | null> {
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!anonKey) {
    // Sin anon key no hay camino nuevo posible. No es un error: es una
    // instalación que todavía no se configuró para Supabase Auth.
    return null;
  }

  const cliente = createClient(url(), anonKey, opcionesComunes);
  const { data, error } = await cliente.auth.signInWithPassword({
    email: emailDeUsuario(nombre),
    password,
  });

  if (error || !data.session) {
    log.info(`[auth] login por Supabase Auth no prosperó para "${nombre}": ${error?.message ?? 'sin sesión'}`);
    return null;
  }

  const meta = (data.user?.app_metadata ?? {}) as { rol?: string; id_usuario?: number };
  if (typeof meta.id_usuario !== 'number' || !meta.rol) {
    // La identidad existe pero no trae los datos del negocio: no alcanza para
    // operar, porque el resto del sistema trabaja con id_usuario.
    log.warn(`[auth] la identidad de "${nombre}" no tiene id_usuario/rol en app_metadata`);
    await cliente.auth.signOut();
    return null;
  }

  clienteSesion = cliente;
  log.info(`[auth] sesión iniciada para "${nombre}" (rol ${meta.rol}); la caja opera con su token`);

  return {
    idUsuario: meta.id_usuario,
    nombreEmpleado: (data.user?.user_metadata?.nombre_empleado as string) ?? nombre,
    rol: meta.rol,
  };
}

/** Cierra la sesión y vuelve a operar con service_role. */
export async function cerrarSesion(): Promise<void> {
  if (!clienteSesion) return;
  try {
    await clienteSesion.auth.signOut();
  } catch (err) {
    log.warn('[auth] error al cerrar sesión:', err);
  }
  clienteSesion = null;
}
