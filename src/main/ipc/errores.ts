// Cómo se traduce una excepción del proceso main al `Resultado` que cruza IPC.
//
// Vive aparte de `index.ts` porque es una función pura sobre el contrato de
// errores: no necesita ninguno de los 20 servicios que ese archivo importa, y
// tenerla acá es lo que permite probarla sin montar medio proceso main.

import { VentaError } from '../services/ventaService';
import type { Resultado } from '../../shared/types/api';

/**
 * La forma de un error de Supabase (`PostgrestError`).
 *
 * NO es una instancia de `Error`: es un objeto plano. Ese detalle es el que
 * hacía que la pantalla mostrara `[object Object]`.
 */
interface ErrorSupabase {
  message: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

function esErrorSupabase(err: unknown): err is ErrorSupabase {
  return (
    typeof err === 'object' && err !== null && !(err instanceof Error) &&
    typeof (err as { message?: unknown }).message === 'string'
  );
}

/**
 * Qué se le muestra al cajero cuando la base rechaza una operación.
 *
 * El mensaje crudo de PostgreSQL no sirve en el mostrador: dice
 * «function crypt(text, text) does not exist», que no le indica a nadie qué
 * hacer. El técnico no se pierde --va en `detalle`, y el log lo escribe
 * entero--; lo que cambia es qué se lee en pantalla.
 *
 * Los códigos son SQLSTATE. Los tres de «undefined» son los que aparecen
 * cuando el repositorio tiene una migración que la base no: vale la pena
 * nombrarlos, porque el arreglo es concreto y siempre el mismo.
 */
function mensajeAmigable(e: ErrorSupabase): string {
  switch (e.code) {
    case '42883': // undefined_function
    case '42P01': // undefined_table
    case '42703': // undefined_column
      return 'La base de datos no tiene aplicada una migración que el sistema necesita. Ver AUDITORIA.md.';
    case '23505':
      return 'Ya existe un registro con ese valor.';
    case '23503':
      return 'Hay otros registros que dependen de este, así que no se puede completar.';
    case '23514':
      return 'Los datos no cumplen una validación de la base.';
    case '42501': // insufficient_privilege
      return 'Este usuario no tiene permiso para esa operación.';
    case 'PGRST301':
      return 'La sesión expiró. Volvé a iniciar sesión.';
    default:
      return 'Error al comunicarse con la base de datos.';
  }
}

// Aplana cualquier excepción del servicio a un Resultado serializable.
// Las clases custom (VentaError) pierden su prototipo al cruzar IPC, así
// que extraemos los campos a primitivas antes de devolver.
export function normalizarError(err: unknown): Resultado<never> {
  if (err instanceof VentaError) {
    return {
      ok: false,
      codigo: err.codigo,
      mensaje: err.mensajeUsuario,
      detalle: err.detalleTecnico,
    };
  }

  // Los servicios hacen `if (error) throw error` con el error de Supabase tal
  // cual, que es un objeto plano. Sin esta rama, `String(err)` da
  // "[object Object]" y esa cadena es lo único que llega a la pantalla: el
  // código, el mensaje real y el hint se pierden en el camino.
  if (esErrorSupabase(err)) {
    const detalle = [err.message, err.details, err.hint]
      .filter((x): x is string => typeof x === 'string' && x.length > 0)
      .join(' · ');
    return {
      ok: false,
      codigo: err.code ?? 'DB',
      mensaje: mensajeAmigable(err),
      detalle,
    };
  }

  const mensaje = err instanceof Error ? err.message : JSON.stringify(err);
  return {
    ok: false,
    codigo: 'UNKNOWN',
    mensaje: mensaje,
    detalle: mensaje,
  };
}
