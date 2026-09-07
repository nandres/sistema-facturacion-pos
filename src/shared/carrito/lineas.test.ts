import { describe, it, expect } from 'vitest';
import {
  agregarLinea,
  cambiarCantidadLinea,
  fijarCantidad,
  quitarLineaDelCarrito,
  type LineaCarrito,
} from './lineas';
import type { Producto } from '../types/productos';

const producto = (p: Partial<Producto> = {}): Producto => ({
  codigo_barras: '7790001',
  nombre: 'Yerba Kurupí 1kg',
  precio_venta: 18000,
  precio_costo: 12000,
  stock: 10,
  iva: 10,
  ...p,
});

const linea = (p: Partial<LineaCarrito> = {}): LineaCarrito => ({
  codigo_barras: '7790001',
  nombre: 'Yerba Kurupí 1kg',
  precio_unitario: 18000,
  cantidad: 1,
  stock_disponible: 10,
  iva: 10,
  ...p,
});

/** Estrecha el resultado y falla con un mensaje útil si no era `ok`. */
function carritoDe(r: ReturnType<typeof agregarLinea>): LineaCarrito[] {
  if (!r.ok) throw new Error(`esperaba ok, vino rechazo por stock de ${r.nombre}`);
  return r.carrito;
}

describe('agregarLinea', () => {
  it('abre una linea nueva cuando el producto no esta', () => {
    const r = carritoDe(agregarLinea([], producto(), 1));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      codigo_barras: '7790001',
      nombre: 'Yerba Kurupí 1kg',
      precio_unitario: 18000,
      cantidad: 1,
      stock_disponible: 10,
      iva: 10,
    });
  });

  it('suma sobre la linea existente en vez de abrir una segunda', () => {
    // Escanear dos veces el mismo producto es lo que mas pasa en el mostrador.
    const r = carritoDe(agregarLinea([linea({ cantidad: 1 })], producto(), 1));
    expect(r).toHaveLength(1);
    expect(r[0].cantidad).toBe(2);
  });

  it('suma la cantidad de bascula sobre la linea existente', () => {
    const r = carritoDe(agregarLinea([linea({ cantidad: 250, stock_disponible: 5000 })], producto(), 400));
    expect(r[0].cantidad).toBe(650);
  });

  it('frena al pasarse del stock de la linea', () => {
    const r = agregarLinea([linea({ cantidad: 10, stock_disponible: 10 })], producto(), 1);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.nombre).toBe('Yerba Kurupí 1kg');
      expect(r.disponible).toBe(10);
    }
  });

  it('justo hasta el stock si entra', () => {
    const r = carritoDe(agregarLinea([linea({ cantidad: 9, stock_disponible: 10 })], producto(), 1));
    expect(r[0].cantidad).toBe(10);
  });

  it('no toca el carrito que recibe', () => {
    // Es lo que permite llamarla adentro del actualizador funcional de React.
    const original = [linea({ cantidad: 1 })];
    agregarLinea(original, producto(), 1);
    expect(original[0].cantidad).toBe(1);
  });

  it('respeta el orden: la linea nueva va al final', () => {
    const otra = linea({ codigo_barras: '7790999', nombre: 'Azúcar' });
    const r = carritoDe(agregarLinea([otra], producto(), 1));
    expect(r.map((l) => l.codigo_barras)).toEqual(['7790999', '7790001']);
  });

  it('la linea nueva NO verifica la cantidad contra el stock', () => {
    // Comportamiento actual de la pantalla, conservado tal cual: el tope solo
    // se aplica al sumar sobre una linea que ya existe. Queda documentado acá
    // para que un cambio futuro sea una decision y no un accidente.
    const r = carritoDe(agregarLinea([], producto({ stock: 3 }), 500));
    expect(r[0].cantidad).toBe(500);
    expect(r[0].stock_disponible).toBe(3);
  });
});

describe('cambiarCantidadLinea', () => {
  it('suma uno', () => {
    const r = carritoDe(cambiarCantidadLinea([linea({ cantidad: 2 })], '7790001', 1));
    expect(r[0].cantidad).toBe(3);
  });

  it('resta uno', () => {
    const r = carritoDe(cambiarCantidadLinea([linea({ cantidad: 2 })], '7790001', -1));
    expect(r[0].cantidad).toBe(1);
  });

  it('llegar a cero saca la linea', () => {
    // Asi se anula desde el teclado, sin un paso aparte.
    const r = carritoDe(cambiarCantidadLinea([linea({ cantidad: 1 })], '7790001', -1));
    expect(r).toEqual([]);
  });

  it('pasarse de cero para abajo tambien saca la linea', () => {
    const r = carritoDe(cambiarCantidadLinea([linea({ cantidad: 1 })], '7790001', -5));
    expect(r).toEqual([]);
  });

  it('saca solo la linea que corresponde', () => {
    const otra = linea({ codigo_barras: '7790999', nombre: 'Azúcar', cantidad: 2 });
    const r = carritoDe(cambiarCantidadLinea([otra, linea({ cantidad: 1 })], '7790001', -1));
    expect(r.map((l) => l.codigo_barras)).toEqual(['7790999']);
  });

  it('frena al pasarse del stock', () => {
    const r = cambiarCantidadLinea([linea({ cantidad: 10, stock_disponible: 10 })], '7790001', 1);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.disponible).toBe(10);
  });

  it('un codigo que no esta en el carrito no hace nada', () => {
    const original = [linea({ cantidad: 2 })];
    const r = carritoDe(cambiarCantidadLinea(original, '0000000', 1));
    expect(r).toEqual(original);
  });

  it('no toca el carrito que recibe', () => {
    const original = [linea({ cantidad: 2 })];
    cambiarCantidadLinea(original, '7790001', 1);
    expect(original[0].cantidad).toBe(2);
  });
});

describe('fijarCantidad — el modo cantidad (*)', () => {
  const dos = [
    linea({ codigo_barras: '7790999', nombre: 'Azúcar', cantidad: 1, stock_disponible: 20 }),
    linea({ cantidad: 1, stock_disponible: 8 }),
  ];

  it('fija la cantidad de la linea seleccionada', () => {
    const r = fijarCantidad(dos, 0, 5);
    expect(r[0].cantidad).toBe(5);
    expect(r[1].cantidad).toBe(1);
  });

  it('sin seleccion valida cae en la ultima linea', () => {
    // Es como se comportaba cuando `*` era la unica entrada.
    expect(fijarCantidad(dos, -1, 3)[1].cantidad).toBe(3);
  });

  it('una seleccion fuera de rango tambien cae en la ultima', () => {
    expect(fijarCantidad(dos, 99, 3)[1].cantidad).toBe(3);
  });

  it('recorta contra el stock en vez de rechazar', () => {
    // Distinto de cambiarCantidadLinea, que frena con un mensaje: aca el cajero
    // ya tiene el producto en la mano, asi que se le da lo que hay.
    expect(fijarCantidad(dos, 1, 50)[1].cantidad).toBe(8);
  });

  it('justo el stock entra entero', () => {
    expect(fijarCantidad(dos, 1, 8)[1].cantidad).toBe(8);
  });

  it('con el carrito vacio no hace nada', () => {
    expect(fijarCantidad([], 0, 5)).toEqual([]);
  });

  it('no toca el carrito que recibe', () => {
    fijarCantidad(dos, 0, 9);
    expect(dos[0].cantidad).toBe(1);
  });
});

describe('quitarLineaDelCarrito', () => {
  it('saca la linea por codigo', () => {
    const otra = linea({ codigo_barras: '7790999' });
    expect(quitarLineaDelCarrito([otra, linea()], '7790001').map((l) => l.codigo_barras))
      .toEqual(['7790999']);
  });

  it('un codigo que no esta deja el carrito igual', () => {
    const original = [linea()];
    expect(quitarLineaDelCarrito(original, '0000000')).toEqual(original);
  });

  it('no toca el carrito que recibe', () => {
    const original = [linea()];
    quitarLineaDelCarrito(original, '7790001');
    expect(original).toHaveLength(1);
  });
});
