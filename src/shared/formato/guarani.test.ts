import { describe, it, expect } from 'vitest';
import { formatearGs, formatearGsConPrefijo, parsearGs } from './guarani';

// El formato de moneda lo usan la pantalla y el ticket impreso. Si los dos no
// dan lo mismo, el cliente ve un número en la caja y otro en el papel.

describe('formatearGs', () => {
  it('agrupa los miles con punto', () => {
    expect(formatearGs(1234567)).toBe('1.234.567');
    expect(formatearGs(150000)).toBe('150.000');
    expect(formatearGs(1000)).toBe('1.000');
  });

  it('no agrupa por debajo de mil', () => {
    expect(formatearGs(0)).toBe('0');
    expect(formatearGs(999)).toBe('999');
  });

  it('redondea, porque el guaraní no tiene subunidad de uso diario', () => {
    expect(formatearGs(1500.4)).toBe('1.500');
    expect(formatearGs(1500.5)).toBe('1.501');
  });

  it('conserva el signo del vuelto negativo', () => {
    expect(formatearGs(-2500)).toBe('-2.500');
  });

  it('devuelve 0 ante un número que no es número', () => {
    // Pasa cuando una cuenta divide por cero o un campo llega vacío. En el
    // ticket, "NaN" impreso es peor que un cero.
    expect(formatearGs(NaN)).toBe('0');
    expect(formatearGs(Infinity)).toBe('0');
  });
});

describe('formatearGsConPrefijo', () => {
  it('antepone Gs.', () => {
    expect(formatearGsConPrefijo(45000)).toBe('Gs. 45.000');
  });
});

describe('parsearGs', () => {
  it('deshace el formato', () => {
    expect(parsearGs('1.234.567')).toBe(1234567);
    expect(parsearGs('Gs. 45.000')).toBe(45000);
    expect(parsearGs('1234567')).toBe(1234567);
  });

  it('ignora espacios', () => {
    expect(parsearGs(' 20.000 ')).toBe(20000);
  });

  it('devuelve NaN si no hay número', () => {
    expect(parsearGs('')).toBeNaN();
    expect(parsearGs('abc')).toBeNaN();
  });

  it('ida y vuelta sobre el mismo valor', () => {
    for (const v of [0, 999, 1000, 45000, 1234567, 99999999]) {
      expect(parsearGs(formatearGs(v))).toBe(v);
    }
  });
});
