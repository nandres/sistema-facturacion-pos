// Las operaciones del carrito: agregar un producto, cambiar la cantidad de una
// línea y sacarla. Sin React adentro.
//
// ── POR QUÉ VIVE ACÁ Y NO EN VentaPOS ──────────────────────────────────────
//
// Es el otro lugar donde se decide plata. Un producto que se agrega dos veces
// tiene que sumar en la misma línea, no abrir una segunda; una corrección de
// cantidad que llega a cero tiene que sacar la línea; y el tope de stock tiene
// que frenar antes de cobrar algo que no hay. Nada de eso tenía una prueba,
// porque vivía adentro de tres `setCarrito` en una pantalla de 1.700 líneas.
//
// ── CÓMO SE USA ────────────────────────────────────────────────────────────
//
// Estas funciones se llaman **adentro** del actualizador funcional de React:
//
//     setCarrito((prev) => {
//       const r = agregarLinea(prev, producto, cantidad);
//       if (!r.ok) { setMensajeError(...); return prev; }
//       return r.carrito;
//     });
//
// No es un detalle de estilo. El lector de códigos dispara rápido y dos
// lecturas seguidas pueden caer en el mismo lote de React: calculando sobre
// `prev` se encadenan, y calculando sobre el carrito del render la segunda
// pisaría a la primera.

import type { Producto } from '../types/productos';

/** Una línea del carrito. El carrito trae más contexto que el cálculo fiscal. */
export interface LineaCarrito {
  codigo_barras: string;
  nombre: string;
  precio_unitario: number;
  cantidad: number;
  stock_disponible: number;
  iva: number;
  envase?: { id_envase: number; nombre: string; precio: number; trajo: boolean };
}

/**
 * El resultado de tocar el carrito.
 *
 * Cuando no alcanza el stock devuelve el nombre y lo disponible en vez de un
 * mensaje armado: el texto que ve el cajero lo compone la pantalla.
 */
export type CambioEnCarrito =
  | { ok: true; carrito: LineaCarrito[] }
  | { ok: false; nombre: string; disponible: number };

/**
 * Agrega `cantidad` de un producto.
 *
 * Si el producto ya está en el carrito suma sobre esa línea y respeta el tope
 * de stock. Si no está, abre una línea nueva.
 *
 * OJO: la línea nueva **no** verifica `cantidad` contra el stock, solo lo hace
 * al sumar sobre una existente. Es el comportamiento que tenía la pantalla y se
 * conserva tal cual; la prueba lo deja documentado.
 */
export function agregarLinea(
  carrito: readonly LineaCarrito[],
  producto: Producto,
  cantidad: number,
): CambioEnCarrito {
  const idx = carrito.findIndex((l) => l.codigo_barras === producto.codigo_barras);

  if (idx === -1) {
    return {
      ok: true,
      carrito: [
        ...carrito,
        {
          codigo_barras: producto.codigo_barras,
          nombre: producto.nombre,
          precio_unitario: producto.precio_venta,
          cantidad,
          stock_disponible: producto.stock,
          iva: producto.iva,
        },
      ],
    };
  }

  const existente = carrito[idx];
  if (existente.cantidad + cantidad > existente.stock_disponible) {
    return { ok: false, nombre: existente.nombre, disponible: existente.stock_disponible };
  }

  const copia = [...carrito];
  copia[idx] = { ...existente, cantidad: existente.cantidad + cantidad };
  return { ok: true, carrito: copia };
}

/**
 * Suma `delta` a la cantidad de una línea.
 *
 * Llegar a cero o menos saca la línea: es como se anula desde el teclado, sin
 * un paso aparte. Un código que no está en el carrito no hace nada.
 */
export function cambiarCantidadLinea(
  carrito: readonly LineaCarrito[],
  codigo: string,
  delta: number,
): CambioEnCarrito {
  const idx = carrito.findIndex((l) => l.codigo_barras === codigo);
  if (idx === -1) return { ok: true, carrito: [...carrito] };

  const linea = carrito[idx];
  const nuevaCantidad = linea.cantidad + delta;

  if (nuevaCantidad <= 0) {
    return { ok: true, carrito: carrito.filter((_, i) => i !== idx) };
  }
  if (nuevaCantidad > linea.stock_disponible) {
    return { ok: false, nombre: linea.nombre, disponible: linea.stock_disponible };
  }

  const copia = [...carrito];
  copia[idx] = { ...linea, cantidad: nuevaCantidad };
  return { ok: true, carrito: copia };
}

/**
 * Fija la cantidad de una línea de golpe. Es lo que hace el modo cantidad (`*`).
 *
 * Actúa sobre `lineaSel`, y si esa selección no apunta a nada cae en la última
 * línea, que es como se comportaba cuando `*` era la única entrada.
 *
 * **Recorta contra el stock en vez de rechazar**: tipear 50 sobre un producto
 * con 8 disponibles deja 8. Es distinto de `cambiarCantidadLinea`, que frena
 * con un mensaje, y es a propósito: el cajero ya tiene el producto en la mano.
 */
export function fijarCantidad(
  carrito: readonly LineaCarrito[],
  lineaSel: number,
  cantidad: number,
): LineaCarrito[] {
  if (carrito.length === 0) return [...carrito];

  const idx = lineaSel >= 0 && lineaSel < carrito.length ? lineaSel : carrito.length - 1;
  const objetivo = carrito[idx];
  const copia = [...carrito];
  copia[idx] = { ...objetivo, cantidad: Math.min(cantidad, objetivo.stock_disponible) };
  return copia;
}

/** Saca una línea del carrito. Un código que no está no hace nada. */
export function quitarLineaDelCarrito(
  carrito: readonly LineaCarrito[],
  codigo: string,
): LineaCarrito[] {
  return carrito.filter((l) => l.codigo_barras !== codigo);
}
