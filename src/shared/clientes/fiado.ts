// El crédito de un cliente de fiado: cuánto tiene disponible, si le alcanza
// para la venta en curso, y cómo se lo busca en el mostrador.
//
// ── POR QUÉ VIVE ACÁ Y NO EN VentaPOS ──────────────────────────────────────
//
// `limite_credito - saldo_deudor` estaba escrito **tres veces** en la pantalla
// de caja: en la validación de `cobrar()`, en el panel de crédito y en cada
// fila del desplegable de clientes. Es el mismo patrón que causó A-06 --dos
// copias de la misma cuenta que pueden separarse en el próximo cambio-- y acá
// decide si una venta a crédito se autoriza o se rechaza.
//
// La búsqueda viene junto porque es la otra mitad de lo mismo: elegir mal al
// cliente y calcularle mal el crédito terminan en el mismo lugar, que es fiarle
// a alguien que ya no tiene margen.

import type { ClienteFiado } from '../types/ventas';

/** Lo que el cliente todavía puede llevar fiado. Puede ser negativo si ya se pasó. */
export function creditoDisponible(cliente: Pick<ClienteFiado, 'limite_credito' | 'saldo_deudor'>): number {
  return cliente.limite_credito - cliente.saldo_deudor;
}

/**
 * Si el crédito alcanza para cobrar `total`.
 *
 * Justo alcanza: con disponible igual al total la venta se autoriza, que es lo
 * que hacía la validación original (`disponible < total` era el rechazo).
 */
export function alcanzaElCredito(
  cliente: Pick<ClienteFiado, 'limite_credito' | 'saldo_deudor'>,
  total: number,
): boolean {
  return creditoDisponible(cliente) >= total;
}

/**
 * Busca por RUC exacto, sin distinguir mayúsculas ni espacios al borde.
 *
 * Un texto vacío no es una búsqueda: devuelve `undefined` en vez del primer
 * cliente de la lista.
 */
export function buscarPorRuc(
  clientes: readonly ClienteFiado[],
  texto: string,
): ClienteFiado | undefined {
  const t = texto.trim().toLowerCase();
  if (!t) return undefined;
  return clientes.find((c) => (c.ruc ?? '').toLowerCase() === t);
}

/**
 * Busca por coincidencia parcial de nombre, para el desplegable del mostrador.
 *
 * Un texto vacío devuelve lista vacía, no la lista entera: el desplegable no
 * se abre solo al borrar el campo.
 */
export function buscarPorNombre(
  clientes: readonly ClienteFiado[],
  texto: string,
): ClienteFiado[] {
  const t = texto.toLowerCase().trim();
  if (!t) return [];
  return clientes.filter((c) => c.nombre.toLowerCase().includes(t));
}
