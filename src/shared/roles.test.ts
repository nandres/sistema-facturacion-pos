import { describe, it, expect } from 'vitest';
import { esAdmin, puedeVer, puedeAnular, type Pantalla } from './roles';

// El reparto que definió el dueño: «el cajero vende, cobra, imprime, abre y
// cierra su propia caja, y además da de alta y edita productos y stock. Todo lo
// demás es del administrador.»
//
// Esta prueba existe para que el reparto no se mueva sin que alguien lo note:
// tiene que seguir coincidiendo con las políticas de 20260829000003_rls_por_rol.

const DEL_CAJERO: Pantalla[] = ['home', 'caja', 'historial', 'stock', 'cajacontrol'];
const SOLO_ADMIN: Pantalla[] = ['compras', 'cuentas', 'fiado', 'dashboard', 'informes', 'config'];

describe('esAdmin', () => {
  it('reconoce las dos formas en que se escribe el rol', () => {
    expect(esAdmin('admin')).toBe(true);
    expect(esAdmin('administrador')).toBe(true);
  });

  it('no se confunde con mayúsculas ni espacios sobrantes', () => {
    expect(esAdmin('  ADMIN ')).toBe(true);
    expect(esAdmin('Administrador')).toBe(true);
  });

  it('ante la duda, no es administrador', () => {
    // El rol llega como texto libre desde la base. Un valor inesperado tiene
    // que caer del lado de menos permisos, nunca del de más.
    expect(esAdmin('cajero')).toBe(false);
    expect(esAdmin('supervisor')).toBe(false);
    expect(esAdmin('')).toBe(false);
    expect(esAdmin(null)).toBe(false);
    expect(esAdmin(undefined)).toBe(false);
  });
});

describe('puedeVer', () => {
  it('el cajero entra a lo suyo', () => {
    for (const p of DEL_CAJERO) {
      expect(puedeVer('cajero', p), `cajero debería ver ${p}`).toBe(true);
    }
  });

  it('el cajero no entra a lo del administrador', () => {
    for (const p of SOLO_ADMIN) {
      expect(puedeVer('cajero', p), `cajero NO debería ver ${p}`).toBe(false);
    }
  });

  it('el administrador entra a todo', () => {
    for (const p of [...DEL_CAJERO, ...SOLO_ADMIN]) {
      expect(puedeVer('admin', p), `admin debería ver ${p}`).toBe(true);
    }
  });

  it('el historial queda del lado del cajero: reimprimir es del mostrador', () => {
    expect(puedeVer('cajero', 'historial')).toBe(true);
  });
});

describe('puedeAnular', () => {
  it('anular y devolver son del administrador, como en la base', () => {
    // Coincide con `anular_venta_sesion`, que RLS reserva para administradores.
    expect(puedeAnular('admin')).toBe(true);
    expect(puedeAnular('cajero')).toBe(false);
  });
});
