import { describe, it, expect } from 'vitest';
import { creditoDisponible, alcanzaElCredito, buscarPorRuc, buscarPorNombre } from './fiado';
import type { ClienteFiado } from '../types/ventas';

const cliente = (p: Partial<ClienteFiado>): ClienteFiado => ({
  id_cliente: 1,
  nombre: 'Juana Benítez',
  ruc: '1234567-8',
  telefono: null,
  direccion: null,
  limite_credito: 500000,
  saldo_deudor: 0,
  activo: true,
  ...p,
});

describe('creditoDisponible', () => {
  it('resta la deuda al limite', () => {
    expect(creditoDisponible(cliente({ limite_credito: 500000, saldo_deudor: 120000 }))).toBe(380000);
  });

  it('un cliente sin deuda tiene todo el limite', () => {
    expect(creditoDisponible(cliente({ limite_credito: 500000, saldo_deudor: 0 }))).toBe(500000);
  });

  it('un cliente al tope no tiene nada disponible', () => {
    expect(creditoDisponible(cliente({ limite_credito: 500000, saldo_deudor: 500000 }))).toBe(0);
  });

  it('es negativo si la deuda supero el limite', () => {
    // Puede pasar: el limite se baja despues de que el cliente ya se lo llevo.
    expect(creditoDisponible(cliente({ limite_credito: 300000, saldo_deudor: 500000 }))).toBe(-200000);
  });
});

describe('alcanzaElCredito', () => {
  it('alcanza cuando sobra margen', () => {
    expect(alcanzaElCredito(cliente({ limite_credito: 500000, saldo_deudor: 100000 }), 63500)).toBe(true);
  });

  it('justo alcanza: disponible igual al total se autoriza', () => {
    // La validacion original rechazaba con `disponible < total`, asi que el
    // empate pasa. Si esto cambia, un cliente que gasta exactamente su margen
    // deja de poder comprar.
    expect(alcanzaElCredito(cliente({ limite_credito: 500000, saldo_deudor: 436500 }), 63500)).toBe(true);
  });

  it('no alcanza por un guarani', () => {
    expect(alcanzaElCredito(cliente({ limite_credito: 500000, saldo_deudor: 436501 }), 63500)).toBe(false);
  });

  it('un cliente pasado de limite no puede llevar nada', () => {
    expect(alcanzaElCredito(cliente({ limite_credito: 300000, saldo_deudor: 500000 }), 1)).toBe(false);
  });
});

describe('buscarPorRuc', () => {
  const lista = [
    cliente({ id_cliente: 1, ruc: '1234567-8', nombre: 'Juana Benítez' }),
    cliente({ id_cliente: 2, ruc: '80012345-1', nombre: 'Despensa El Sol' }),
    cliente({ id_cliente: 3, ruc: null, nombre: 'Cliente sin RUC' }),
  ];

  it('encuentra por RUC exacto', () => {
    expect(buscarPorRuc(lista, '80012345-1')?.id_cliente).toBe(2);
  });

  it('ignora espacios al borde', () => {
    expect(buscarPorRuc(lista, '  1234567-8  ')?.id_cliente).toBe(1);
  });

  it('no distingue mayusculas', () => {
    const conLetra = [cliente({ id_cliente: 9, ruc: '4567890-A' })];
    expect(buscarPorRuc(conLetra, '4567890-a')?.id_cliente).toBe(9);
  });

  it('un RUC que no esta no devuelve nada', () => {
    expect(buscarPorRuc(lista, '9999999-9')).toBeUndefined();
  });

  it('texto vacio no devuelve el primero de la lista', () => {
    expect(buscarPorRuc(lista, '')).toBeUndefined();
    expect(buscarPorRuc(lista, '   ')).toBeUndefined();
  });

  it('no confunde el vacio con el cliente sin RUC', () => {
    // `ruc: null` se normaliza a cadena vacia para comparar; si el texto vacio
    // fuera una busqueda valida, engancharia a ese cliente.
    expect(buscarPorRuc(lista, '')).toBeUndefined();
  });
});

describe('buscarPorNombre', () => {
  const lista = [
    cliente({ id_cliente: 1, nombre: 'Juana Benítez' }),
    cliente({ id_cliente: 2, nombre: 'Despensa El Sol' }),
    cliente({ id_cliente: 3, nombre: 'Juan Carlos Ramírez' }),
  ];

  it('encuentra por coincidencia parcial', () => {
    expect(buscarPorNombre(lista, 'juan').map((c) => c.id_cliente)).toEqual([1, 3]);
  });

  it('no distingue mayusculas', () => {
    expect(buscarPorNombre(lista, 'DESPENSA').map((c) => c.id_cliente)).toEqual([2]);
  });

  it('coincide en el medio del nombre', () => {
    expect(buscarPorNombre(lista, 'el sol').map((c) => c.id_cliente)).toEqual([2]);
  });

  it('texto vacio devuelve lista vacia, no la lista entera', () => {
    expect(buscarPorNombre(lista, '')).toEqual([]);
    expect(buscarPorNombre(lista, '   ')).toEqual([]);
  });

  it('sin coincidencias devuelve lista vacia', () => {
    expect(buscarPorNombre(lista, 'zzz')).toEqual([]);
  });
});
