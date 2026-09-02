import { describe, it, expect } from 'vitest';
import {
  montoLinea,
  calcularTotal,
  calcularDescuentoTotal,
  calcularIvaPorTasa,
  calcularIvaTotal,
  calcularBasePorTasa,
  ivaPorTasaSinCeros,
  type LineaFiscal,
} from './fiscal';

const gaseosa = (trajo: boolean): LineaFiscal => ({
  precio_unitario: 12500,
  cantidad: 1,
  iva: 10,
  envase: { precio: 3000, trajo },
});

describe('montoLinea', () => {
  it('multiplica precio por cantidad', () => {
    expect(montoLinea({ precio_unitario: 5000, cantidad: 3, iva: 10 })).toBe(15000);
  });

  it('descuenta el envase que el cliente trajo', () => {
    expect(montoLinea(gaseosa(true))).toBe(9500);
  });

  it('no descuenta si el cliente no trajo el envase', () => {
    expect(montoLinea(gaseosa(false))).toBe(12500);
  });

  it('descuenta el envase por cada unidad', () => {
    expect(montoLinea({ ...gaseosa(true), cantidad: 4 })).toBe(38000);
  });
});

describe('calcularIvaPorTasa — la regresión de A-06', () => {
  // El caso exacto del hallazgo: una gaseosa de 12.500 al 10% con un envase de
  // 3.000 devuelto. Se cobran 9.500. El ticket declaraba 1.136 --el IVA de
  // 12.500-- en vez del IVA de 9.500, así que el comprobante sobredeclaraba IVA
  // cada vez que entraba un envase.
  //
  // OJO con el número: AUDITORIA.md dice 863 y el valor correcto es **864**.
  // 9.500 x 10 / 110 = 863,63..., y el cálculo redondea, no trunca. El código
  // siempre hizo lo correcto; el que truncó fue el documento.
  it('calcula el IVA sobre lo que se cobra, no sobre el precio de lista', () => {
    expect(calcularIvaPorTasa([gaseosa(true)])).toEqual({ 10: 864 });
  });

  it('sin envase devuelto, el IVA es el del precio entero', () => {
    expect(calcularIvaPorTasa([gaseosa(false)])).toEqual({ 10: 1136 });
  });

  it('el precio de góndola ya trae el IVA adentro', () => {
    // 11.000 al 10% => la porción de la DNIT es 1.000, no 1.100.
    expect(calcularIvaPorTasa([{ precio_unitario: 11000, cantidad: 1, iva: 10 }]))
      .toEqual({ 10: 1000 });
  });

  it('agrupa por tasa', () => {
    const carrito: LineaFiscal[] = [
      { precio_unitario: 11000, cantidad: 1, iva: 10 },
      { precio_unitario: 10500, cantidad: 1, iva: 5 },
      { precio_unitario: 8000, cantidad: 1, iva: 0 },
    ];
    expect(calcularIvaPorTasa(carrito)).toEqual({ 10: 1000, 5: 500, 0: 0 });
  });

  it('el IVA total es la suma de las tasas', () => {
    const carrito: LineaFiscal[] = [
      { precio_unitario: 11000, cantidad: 1, iva: 10 },
      { precio_unitario: 10500, cantidad: 1, iva: 5 },
    ];
    expect(calcularIvaTotal(carrito)).toBe(1500);
  });
});

describe('calcularBasePorTasa', () => {
  it('las tres bases suman exactamente el total a pagar', () => {
    // Es lo primero que cualquiera cruza al mirar el recuadro fiscal. Con el
    // envase de por medio es donde antes no cerraba.
    const carrito: LineaFiscal[] = [
      gaseosa(true),
      { precio_unitario: 10500, cantidad: 2, iva: 5 },
      { precio_unitario: 8000, cantidad: 1, iva: 0 },
    ];
    const base = calcularBasePorTasa(carrito);
    expect(base.exentas + base.cinco + base.diez).toBe(calcularTotal(carrito));
  });

  it('reparte cada línea en su casillero', () => {
    const base = calcularBasePorTasa([
      gaseosa(true),
      { precio_unitario: 10500, cantidad: 1, iva: 5 },
      { precio_unitario: 8000, cantidad: 1, iva: 0 },
    ]);
    expect(base).toEqual({ diez: 9500, cinco: 10500, exentas: 8000 });
  });

  it('trata cualquier tasa que no sea 5 ni 10 como exenta', () => {
    expect(calcularBasePorTasa([{ precio_unitario: 1000, cantidad: 1, iva: 0 }]).exentas).toBe(1000);
  });
});

describe('calcularTotal y calcularDescuentoTotal', () => {
  it('el total descuenta los envases devueltos', () => {
    expect(calcularTotal([gaseosa(true), gaseosa(true)])).toBe(19000);
  });

  it('el descuento suma solo los envases que el cliente trajo', () => {
    expect(calcularDescuentoTotal([gaseosa(true), gaseosa(false)])).toBe(3000);
  });

  it('un carrito vacío no rompe nada', () => {
    expect(calcularTotal([])).toBe(0);
    expect(calcularIvaPorTasa([])).toEqual({});
    expect(calcularBasePorTasa([])).toEqual({ exentas: 0, cinco: 0, diez: 0 });
  });
});

describe('ivaPorTasaSinCeros', () => {
  it('saca las tasas en cero, que el ticket imprimía como «IVA 0%: 0»', () => {
    const carrito: LineaFiscal[] = [
      { precio_unitario: 11000, cantidad: 1, iva: 10 },
      { precio_unitario: 8000, cantidad: 1, iva: 0 },
    ];
    expect(calcularIvaPorTasa(carrito)).toHaveProperty('0', 0);
    expect(ivaPorTasaSinCeros(carrito)).toEqual({ 10: 1000 });
  });
});
