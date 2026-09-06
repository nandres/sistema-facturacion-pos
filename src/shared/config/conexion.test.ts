import { describe, it, expect } from 'vitest';
import { claveValida, pistaDeClave, urlValida } from './conexion';

// ── POR QUÉ ESTA PRUEBA EXISTE ─────────────────────────────────────────────
//
// Estos tres controles son lo único que se interpone entre alguien tipeando en
// la pantalla de configuración inicial y una caja que no puede vender.
//
// El error real de esa pantalla no es escribir mal la URL: es pegar la
// dirección en el campo de la clave, o pegar media clave porque la selección
// se cortó. Las dos cosas se guardan sin quejarse si no se controla la forma,
// y las dos fallan recién en la primera consulta a la base --con el comercio
// esperando.

describe('urlValida', () => {
  it('acepta una URL de proyecto Supabase', () => {
    expect(urlValida('https://abcdefgh.supabase.co')).toBe(true);
  });

  it('acepta espacios alrededor: se pega desde el panel y arrastra uno', () => {
    expect(urlValida('  https://abcdefgh.supabase.co  ')).toBe(true);
  });

  it('rechaza http pelado: la clave de servicio no viaja en claro', () => {
    expect(urlValida('http://abcdefgh.supabase.co')).toBe(false);
  });

  it('rechaza lo que no es una URL', () => {
    expect(urlValida('abcdefgh.supabase.co')).toBe(false);
    expect(urlValida('')).toBe(false);
    expect(urlValida('   ')).toBe(false);
  });
});

describe('claveValida', () => {
  // Un JWT de Supabase: tres partes separadas por punto y bastante largo.
  const jwt = `${'a'.repeat(20)}.${'b'.repeat(40)}.${'c'.repeat(20)}`;

  it('acepta una clave con forma de JWT', () => {
    expect(claveValida(jwt)).toBe(true);
  });

  it('rechaza una URL pegada en el campo de la clave', () => {
    expect(claveValida('https://abcdefgh.supabase.co')).toBe(false);
  });

  it('rechaza media clave', () => {
    expect(claveValida(jwt.slice(0, 30))).toBe(false);
  });

  it('rechaza el vacío', () => {
    expect(claveValida('')).toBe(false);
  });
});

describe('pistaDeClave', () => {
  it('muestra sólo el final, que alcanza para reconocerla', () => {
    expect(pistaDeClave('abcdefghijklmnop')).toBe('…klmnop');
  });

  it('sin clave no inventa una pista', () => {
    expect(pistaDeClave('')).toBe('');
    expect(pistaDeClave('   ')).toBe('');
  });
});
