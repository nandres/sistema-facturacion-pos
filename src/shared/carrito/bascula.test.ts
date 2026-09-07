import { describe, it, expect } from 'vitest';
import { pesoDesdeGramos } from './bascula';

describe('pesoDesdeGramos', () => {
  it('convierte gramos a kilos', () => {
    expect(pesoDesdeGramos('1500')).toBe(1.5);
  });

  it('un kilo justo', () => {
    expect(pesoDesdeGramos('1000')).toBe(1);
  });

  it('pesos chicos, que son los que mas se pesan en mostrador', () => {
    expect(pesoDesdeGramos('250')).toBe(0.25);
    expect(pesoDesdeGramos('1')).toBe(0.001);
  });

  it('cero no es un peso', () => {
    expect(pesoDesdeGramos('0')).toBeNull();
  });

  it('un peso negativo no es un peso', () => {
    expect(pesoDesdeGramos('-500')).toBeNull();
  });

  it('texto no es un peso', () => {
    expect(pesoDesdeGramos('abc')).toBeNull();
    expect(pesoDesdeGramos('')).toBeNull();
  });

  it('corta en el primer caracter no numerico', () => {
    // Comportamiento conservado: una lectura mal terminada del lector puede
    // dejar basura al final, y 1500 gramos siguen siendo 1500 gramos.
    expect(pesoDesdeGramos('1500abc')).toBe(1.5);
  });
});
