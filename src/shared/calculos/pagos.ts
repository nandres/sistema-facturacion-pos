// El dinero que entra y el que vuelve: cuánto se recibió, cuánto falta, cuánto
// vuelto se entrega y con qué tipo de pago queda registrada la venta.
//
// ── POR QUÉ VIVE ACÁ Y NO EN VentaPOS ──────────────────────────────────────
//
// Es la aritmética que el cajero contrasta contra la plata que tiene en la
// mano, y estaba en cuatro `useMemo` y una función suelta dentro de una
// pantalla de 1.756 líneas: no había forma de probarla sin montar la interfaz
// entera. El vuelto es el único número del sistema que se le devuelve al
// cliente en efectivo; un error acá no lo corrige nadie después.
//
// El criterio es el mismo que en `fiscal.ts`: una sola definición por cantidad,
// para que dos lugares no puedan discrepar. Lo que se cobra sale de
// `calcularTotal`; lo que se recibe sale de `sumarPagos`. Vuelto y faltante son
// las dos caras de la misma resta y nunca son ambos distintos de cero.

import type { MedioPago, PagoInput, TipoPago } from '../types/ventas';

/**
 * Lo que el cliente entregó, sumando todos los medios de pago.
 *
 * Un carrito puede cobrarse con varios pagos --mitad efectivo, mitad tarjeta--
 * y cada uno es una entrada propia.
 */
export function sumarPagos(pagos: readonly PagoInput[]): number {
  return pagos.reduce((suma, p) => suma + p.monto, 0);
}

/**
 * El vuelto a entregar.
 *
 * Cero mientras no haya nada cobrado o nada recibido: con el carrito vacío o
 * sin pagos cargados, la resta daría un número que el visor no debe mostrar.
 * Nunca es negativo; si falta plata, eso es `calcularFaltante`.
 */
export function calcularVuelto(recibido: number, total: number): number {
  if (recibido <= 0 || total <= 0) return 0;
  return Math.max(0, recibido - total);
}

/**
 * Lo que todavía falta cobrar.
 *
 * Cero con el carrito vacío: sin nada que cobrar no falta nada. Nunca es
 * negativo; el excedente es `calcularVuelto`.
 */
export function calcularFaltante(recibido: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, total - recibido);
}

/**
 * El `tipo_pago` con el que queda registrada la venta.
 *
 * Antes esto terminaba en `return 'efectivo'` como cajón de sastre, y ahí caía
 * el cheque: una venta cobrada con cheque quedaba registrada como efectivo y
 * el cierre de caja reclamaba esa plata en el cajón. Con un solo medio, el
 * tipo es ese medio y punto; con varios, es `mixto`.
 *
 * Sin pagos devuelve `efectivo`, que es el caso de la venta a crédito puro
 * antes de que se le cargue nada.
 */
export function determinarTipoPago(pagos: readonly PagoInput[]): TipoPago {
  const mediosUnicos = new Set<MedioPago>(pagos.map((p) => p.medio_pago));
  if (mediosUnicos.size === 0) return 'efectivo';
  if (mediosUnicos.size === 1) return [...mediosUnicos][0];
  return 'mixto';
}

/**
 * El importe que resulta de aplicar `transformar` a los dígitos del visor.
 *
 * El visor del teclado numérico guarda el importe ya formateado
 * ("100.000"), así que cada tecla trabaja sobre los dígitos crudos y el
 * resultado se vuelve a formatear. Devuelve el número, no el texto: el formato
 * es cosa de la pantalla.
 *
 * Cero significa visor vacío --se borró todo, o quedó algo que no es un
 * importe válido--, y es lo que apaga el botón de agregar.
 */
export function siguienteImporte(
  textoPrevio: string,
  transformar: (digitos: string) => string,
): number {
  const n = parseInt(transformar(textoPrevio.replace(/\D/g, '')), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}
