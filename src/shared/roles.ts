// Qué puede ver y hacer cada rol.
//
// ── POR QUÉ ESTO EXISTE ────────────────────────────────────────────────────
//
// Hasta ahora `usuario.rol` se imprimía en la cabecera y no se usaba para nada
// más: todo usuario veía Informes, Compras, Cuentas y Configuración. La
// separación de roles que definió el dueño existía en la base --las políticas
// de `20260829000003_rls_por_rol.sql`-- y no en la pantalla.
//
// Eso deja dos problemas. Uno de producto: el cajero ve botones que no le
// corresponden. Y uno peor, de experiencia: cuando la Fase 5 se encienda y la
// base empiece a rechazar esas operaciones, el cajero va a recibir un error
// de permisos en vez de simplemente no ver el botón.
//
// ── ESTO NO ES LA SEGURIDAD ────────────────────────────────────────────────
//
// Es la capa de presentación. La autorización real la aplica PostgreSQL con
// RLS, que es lo único que un renderer comprometido no puede saltear. Acá se
// decide qué se dibuja; allá se decide qué se permite. Las dos tienen que
// decir lo mismo, y por eso el reparto de abajo sigue exactamente el que
// definió el dueño y que implementan las políticas.
//
// ── EL REPARTO ─────────────────────────────────────────────────────────────
//
// «El cajero vende, cobra, imprime, abre y cierra su propia caja, y además da
// de alta y edita productos y stock. Todo lo demás es del administrador.»

/** Las pantallas de la aplicación. Estaba duplicado en App.tsx y Home.tsx. */
export type Pantalla =
  | 'home'
  | 'caja'
  | 'historial'
  | 'stock'
  | 'cajacontrol'
  | 'cuentas'
  | 'informes'
  | 'compras'
  | 'dashboard'
  | 'fiado'
  | 'config';

/**
 * Las pantallas que solo abre un administrador.
 *
 * `historial` NO está acá: reimprimir un ticket es parte del trabajo del
 * mostrador. Lo que sí es de administrador son las dos acciones destructivas
 * de esa pantalla --anular y devolver-- y se ocultan por separado, porque son
 * botones dentro de una pantalla compartida. Coinciden con
 * `anular_venta_sesion`, que la base ya reserva para administradores.
 */
const SOLO_ADMIN: ReadonlySet<Pantalla> = new Set<Pantalla>([
  'compras',
  'cuentas',
  'fiado',
  'dashboard',
  'informes',
  'config',
]);

/**
 * El rol llega como texto libre desde la base, así que se compara normalizado.
 * Cualquier cosa que no sea administrador se trata como cajero: ante la duda,
 * menos permisos.
 */
export function esAdmin(rol: string | null | undefined): boolean {
  const r = (rol ?? '').trim().toLowerCase();
  return r === 'admin' || r === 'administrador';
}

/** Si este rol puede abrir esta pantalla. */
export function puedeVer(rol: string | null | undefined, pantalla: Pantalla): boolean {
  return !SOLO_ADMIN.has(pantalla) || esAdmin(rol);
}

/** Anular una venta y registrar devoluciones. Reservado al administrador. */
export function puedeAnular(rol: string | null | undefined): boolean {
  return esAdmin(rol);
}
