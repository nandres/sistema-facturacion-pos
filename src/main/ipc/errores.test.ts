import { describe, it, expect } from 'vitest';
import { normalizarError } from './errores';
import { VentaError } from '../services/ventaService';

// ── POR QUÉ ESTA PRUEBA EXISTE ─────────────────────────────────────────────
//
// La pantalla de login mostraba literalmente «[object Object]» cuando la base
// rechazaba la autenticación. La causa: los errores de Supabase no son
// instancias de `Error` --son objetos planos {message, code, details, hint}--
// y `String(err)` sobre un objeto plano da exactamente esa cadena.
//
// El error real decía «function crypt(text, text) does not exist», que es la
// pista de que faltaba una migración. Nada de eso llegaba a la pantalla ni
// servía para diagnosticar.
//
// Los 76 canales pasan por acá, así que el problema no era del login.

describe('normalizarError — errores de Supabase', () => {
  const errorCrypt = {
    code: '42883',
    details: null,
    hint: 'No function matches the given name and argument types.',
    message: 'function crypt(text, text) does not exist',
  };

  it('nunca devuelve "[object Object]"', () => {
    const r = normalizarError(errorCrypt);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.mensaje).not.toContain('[object Object]');
    expect(r.detalle).not.toContain('[object Object]');
  });

  it('conserva el código SQLSTATE', () => {
    const r = normalizarError(errorCrypt);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.codigo).toBe('42883');
  });

  it('el detalle técnico conserva el mensaje y el hint', () => {
    const r = normalizarError(errorCrypt);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.detalle).toContain('function crypt(text, text) does not exist');
    expect(r.detalle).toContain('No function matches');
  });

  it('un "no existe" de la base se traduce a que falta una migración', () => {
    // Es el caso más útil de traducir: el arreglo es concreto y siempre el
    // mismo, y el mensaje crudo no se lo dice a nadie.
    for (const code of ['42883', '42P01', '42703']) {
      const r = normalizarError({ ...errorCrypt, code });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.mensaje, `código ${code}`).toContain('migración');
    }
  });

  it('traduce los códigos de integridad que el cajero puede provocar', () => {
    const casos: [string, RegExp][] = [
      ['23505', /ya existe/i],
      ['23503', /dependen/i],
      ['23514', /validación/i],
      ['42501', /permiso/i],
    ];
    for (const [code, esperado] of casos) {
      const r = normalizarError({ message: 'x', code });
      expect(r.ok).toBe(false);
      if (r.ok) return;
      expect(r.mensaje, `código ${code}`).toMatch(esperado);
    }
  });

  it('un código desconocido no rompe: cae a un mensaje genérico', () => {
    const r = normalizarError({ message: 'algo raro', code: 'XX999' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.codigo).toBe('XX999');
    expect(r.mensaje).toMatch(/base de datos/i);
    expect(r.detalle).toContain('algo raro');
  });

  it('sin código, igual se identifica como error de base', () => {
    const r = normalizarError({ message: 'sin code' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.codigo).toBe('DB');
  });
});

describe('normalizarError — el resto', () => {
  it('VentaError conserva su código y su mensaje de usuario', () => {
    const r = normalizarError(
      new VentaError('P0004', 'Stock insuficiente.', 'stock 2 < 5 para 779...'),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.codigo).toBe('P0004');
    expect(r.mensaje).toBe('Stock insuficiente.');
    expect(r.detalle).toContain('stock 2 < 5');
  });

  it('un Error normal usa su message', () => {
    const r = normalizarError(new Error('se cayó el puerto'));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.codigo).toBe('UNKNOWN');
    expect(r.mensaje).toBe('se cayó el puerto');
  });

  it('un objeto sin message se serializa en vez de dar "[object Object]"', () => {
    const r = normalizarError({ algo: 1, otro: 'dos' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.mensaje).not.toContain('[object Object]');
    expect(r.mensaje).toContain('algo');
  });

  it('un string tirado como excepción sobrevive', () => {
    const r = normalizarError('falló');
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.mensaje).toContain('falló');
  });
});
