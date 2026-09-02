import { obtenerClienteSupabase } from './baseService';
import { iniciarSesion, cerrarSesion, modoAcceso } from './supabaseClient';
import { log } from './logger';

export interface Usuario {
  id_usuario: number;
  nombre_empleado: string;
  rol: string;
}

/**
 * Login del cajero. Intenta el camino nuevo y cae al viejo si no prospera.
 *
 * 1. **Supabase Auth.** Si entra, la caja pasa a operar con el token de ese
 *    cajero: RLS lo alcanza y deja de usarse la llave maestra. Es el objetivo
 *    de C-01.
 * 2. **`verificar_usuario`.** El login de siempre, contra la tabla `usuarios`
 *    con bcrypt, operando con `service_role`.
 *
 * El paso 2 existe para que la transición no pueda dejar la caja sin vender:
 * una identidad que todavía no se migró, una instalación sin `SUPABASE_ANON_KEY`
 * o un problema con Supabase Auth no impiden abrir el local. Se saca cuando el
 * camino nuevo esté probado en el mostrador.
 */
export async function autenticar(nombre: string, password: string): Promise<Usuario | null> {
  const porAuth = await iniciarSesion(nombre, password);
  if (porAuth) {
    return {
      id_usuario: porAuth.idUsuario,
      nombre_empleado: porAuth.nombreEmpleado,
      rol: porAuth.rol,
    };
  }

  // Sin sesión: cualquier consulta que venga vuelve a salir por service_role.
  await cerrarSesion();

  const supabase = obtenerClienteSupabase();
  const { data, error } = await supabase.rpc('verificar_usuario', {
    p_nombre: nombre,
    p_password: password,
  });
  if (error) throw error;

  if (data && data.length > 0) {
    log.warn(`[auth] "${nombre}" entró por el login anterior; la caja opera con ${modoAcceso()}`);
    return { id_usuario: Number(data[0].id_usuario), nombre_empleado: data[0].nombre_empleado, rol: data[0].rol };
  }
  return null;
}

/** Cierra la sesión del cajero. Se llama al cambiar de usuario. */
export async function cerrarSesionUsuario(): Promise<void> {
  await cerrarSesion();
}

export async function crearUsuario(nombre: string, password: string, rol: string = 'cajero'): Promise<Usuario> {
  const supabase = obtenerClienteSupabase();
  const { data, error } = await supabase.rpc('crear_usuario', {
    p_nombre: nombre,
    p_password: password,
    p_rol: rol,
  });
  if (error) throw error;
  return {
    id_usuario: Number(data[0].id_usuario),
    nombre_empleado: data[0].nombre_empleado,
    rol: data[0].rol,
  };
}
