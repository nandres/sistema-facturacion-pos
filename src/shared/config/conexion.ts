// Conexión al proyecto Supabase del comercio.
//
// **No vive en el código ni viaja dentro del instalador.** Hasta la versión
// anterior, `SUPABASE_URL` y las claves salían del `.env` que
// `build.extraResources` empaquetaba adentro del `.exe`. Eso costaba dos cosas:
//
//   1. Un instalador por cliente. Cada comercio tiene su propio proyecto
//      Supabase, así que cada comercio necesitaba su propia compilación. No es
//      un producto: es una compilación a medida por venta.
//   2. La `service_role` key --que tiene BYPASSRLS y por lo tanto control total
//      de la base-- viajaba dentro de un binario que se distribuye.
//
// Ahora se configura por instalación y se guarda en electron-store, igual que
// el nombre del comercio y la impresora. El instalador es uno solo.
//
// Ojo con lo que esto **no** arregla: la clave sigue estando en la PC de la
// caja, sólo que cifrada con el almacén del sistema en vez de en un `.env` en
// texto plano. Lo que la saca de ahí es la Fase 5 --un token por cajero-- y
// eso es otro trabajo.

export interface Conexion {
  url: string;
  serviceRoleKey: string;
  /** Opcional: su presencia es lo que enciende el login por cajero (Fase 5). */
  anonKey: string;
}

export const CONEXION_VACIA: Conexion = { url: '', serviceRoleKey: '', anonKey: '' };

/**
 * Lo que la pantalla puede ver.
 *
 * Las claves no vuelven al renderer en claro: cruzan el puente una sola vez,
 * cuando se guardan. Para mostrarlas alcanza con una pista --los últimos
 * caracteres-- que sirve para reconocer cuál está cargada sin exponerla.
 */
export interface EstadoConexion {
  configurada: boolean;
  url: string;
  serviceRoleKeyPista: string;
  anonKeyPista: string;
  /** Si el sistema operativo pudo cifrarlas en reposo. */
  cifrada: boolean;
}

/**
 * Una URL de proyecto Supabase.
 *
 * Se valida acá y no en la pantalla porque el mismo control lo necesitan el
 * arranque del proceso main --que decide si hay que pedir configuración-- y el
 * guardado. Una URL mal escrita no falla al guardar: falla en la primera venta,
 * con la caja llena de gente.
 */
export function urlValida(url: string): boolean {
  const limpia = url.trim();
  if (!limpia) return false;
  try {
    const u = new URL(limpia);
    return u.protocol === 'https:' && u.hostname.length > 0;
  } catch {
    return false;
  }
}

/**
 * Las claves de Supabase son JWT: tres partes separadas por punto.
 *
 * No se verifica la firma --para eso habría que conocer el secreto del
 * proyecto-- pero la forma alcanza para atajar el error real: pegar la URL en
 * el campo de la clave, o pegar media clave.
 */
export function claveValida(clave: string): boolean {
  const limpia = clave.trim();
  return limpia.split('.').length === 3 && limpia.length > 40;
}

/** Los últimos caracteres, para que la pantalla diga cuál está cargada. */
export function pistaDeClave(clave: string): string {
  const limpia = clave.trim();
  return limpia ? `…${limpia.slice(-6)}` : '';
}
