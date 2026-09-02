// El cálculo fiscal de una venta: qué se cobra por línea, cómo se reparte en
// bases gravadas y cuánto IVA declara el comprobante.
//
// ── POR QUÉ VIVE ACÁ Y NO EN VentaPOS ──────────────────────────────────────
//
// Estaba adentro de `VentaPOS.tsx`, en tres `useMemo` distintos, y de ahí sale
// lo que se imprime en el ticket. Es la aritmética con consecuencia fiscal del
// sistema y no habia forma de probarla sin montar la pantalla entera.
//
// Que esté acá no es solo por las pruebas: A-06 fue exactamente un desacuerdo
// entre dos de esos tres cálculos. El total restaba el envase devuelto y el
// IVA no, así que el mismo recuadro mostraba «Gravadas 10%: 9.500» al lado de
// un IVA calculado sobre 12.500. Con una sola función que define «cuánto se
// cobra por esta línea», los tres números salen de la misma base y no pueden
// volver a discrepar.
//
// ── EL CRITERIO ────────────────────────────────────────────────────────────
//
// En Paraguay el precio de góndola **ya trae el IVA adentro**. Así que el IVA
// de una línea no se suma al precio: es la porción del precio que le toca a la
// DNIT, y sale de `monto * tasa / (100 + tasa)`.
//
// El envase retornable que el cliente trajo se trata como **descuento**: baja
// lo que se cobra y, por lo tanto, baja la base gravada y el IVA con ella.

/** Lo mínimo que hace falta para calcular. El carrito trae más campos. */
export interface LineaFiscal {
  precio_unitario: number;
  cantidad: number;
  /** Tasa de IVA en porcentaje: 0, 5 o 10. */
  iva: number;
  envase?: { precio: number; trajo: boolean };
}

/**
 * Lo que efectivamente se cobra por una línea.
 *
 * Es la única definición de esa cantidad en todo el sistema: el total, las
 * bases gravadas y el IVA salen todos de acá.
 */
export function montoLinea(l: LineaFiscal): number {
  const descuento = l.envase && l.envase.trajo ? l.envase.precio : 0;
  return (l.precio_unitario - descuento) * l.cantidad;
}

/** El descuento por envase devuelto de una línea. Cero si no trajo. */
export function descuentoLinea(l: LineaFiscal): number {
  return l.envase && l.envase.trajo ? l.envase.precio * l.cantidad : 0;
}

/** Total a pagar del carrito. */
export function calcularTotal(lineas: readonly LineaFiscal[]): number {
  return lineas.reduce((acc, l) => acc + montoLinea(l), 0);
}

/** Suma de los envases devueltos. */
export function calcularDescuentoTotal(lineas: readonly LineaFiscal[]): number {
  return lineas.reduce((acc, l) => acc + descuentoLinea(l), 0);
}

/**
 * IVA declarado, agrupado por tasa.
 *
 * Redondea por línea, no al final: es lo que hacía el cálculo original y lo
 * que corresponde, porque cada línea es un hecho imponible propio.
 */
export function calcularIvaPorTasa(lineas: readonly LineaFiscal[]): Record<number, number> {
  const grupos: Record<number, number> = {};
  for (const l of lineas) {
    const monto = montoLinea(l);
    grupos[l.iva] = (grupos[l.iva] ?? 0) + Math.round((monto * l.iva) / (100 + l.iva));
  }
  return grupos;
}

/** El IVA total del comprobante. */
export function calcularIvaTotal(lineas: readonly LineaFiscal[]): number {
  return Object.values(calcularIvaPorTasa(lineas)).reduce((a, b) => a + b, 0);
}

export interface BasePorTasa {
  exentas: number;
  cinco: number;
  diez: number;
}

/**
 * El desglose del recuadro fiscal, con el importe cobrado (IVA incluido).
 *
 * `exentas + cinco + diez` tiene que dar **exactamente** el total a pagar: es
 * lo primero que cualquiera cruza al mirar el recuadro, y por eso las tres
 * salen de `montoLinea`.
 */
export function calcularBasePorTasa(lineas: readonly LineaFiscal[]): BasePorTasa {
  const base: BasePorTasa = { exentas: 0, cinco: 0, diez: 0 };
  for (const l of lineas) {
    const monto = montoLinea(l);
    if (l.iva === 5) base.cinco += monto;
    else if (l.iva === 10) base.diez += monto;
    else base.exentas += monto;
  }
  return base;
}

/**
 * Las tasas con IVA distinto de cero.
 *
 * El ticket imprimía «IVA 0%: 0» cuando el carrito tenía productos exentos,
 * porque el agrupamiento crea la clave igual. Es ruido en el papel.
 */
export function ivaPorTasaSinCeros(lineas: readonly LineaFiscal[]): Record<number, number> {
  const grupos = calcularIvaPorTasa(lineas);
  const limpio: Record<number, number> = {};
  for (const [tasa, monto] of Object.entries(grupos)) {
    if (monto !== 0) limpio[Number(tasa)] = monto;
  }
  return limpio;
}
