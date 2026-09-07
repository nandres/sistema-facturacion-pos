/**
 * @vitest-environment jsdom
 *
 * Las pruebas de la pantalla de caja.
 *
 * ── QUÉ CUBREN Y POR QUÉ ───────────────────────────────────────────────────
 *
 * La regla de oro de la auditoría dice que no se puede romper la lectura
 * continua de códigos de barras. Eso no es aritmética y no se puede probar sin
 * un DOM: es el foco del input, el `Enter` con el que termina cada lectura, y
 * el `*` que entra en modo cantidad.
 *
 * Hasta acá eso solo se podía verificar a mano, en el mostrador, con el lector
 * en la mano. Estas pruebas son la red que faltaba para poder seguir partiendo
 * `VentaPOS` sin jugar a la ruleta.
 *
 * El lector USB emula un teclado: escribe el código y manda `Enter`. Por eso
 * las pruebas escriben en el input y disparan `Enter`, que es exactamente lo
 * que hace el hardware.
 */
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VentaPOS from './VentaPOS';
import type { Producto } from '../../shared/types/productos';

const yerba: Producto = {
  codigo_barras: '7790001',
  nombre: 'Yerba Kurupí 1kg',
  precio_venta: 18000,
  precio_costo: 12000,
  stock: 8,
  iva: 10,
};

const ok = <T,>(data: T) => Promise.resolve({ ok: true as const, data });

/** El `window.api` mínimo para que la pantalla monte y se pueda escanear. */
function stubApi(productos: Producto[] = [yerba]) {
  return {
    envases: { listar: () => ok([]) },
    categorias: { listar: () => ok([]) },
    clientes: { listar: () => ok([]), crear: () => ok(null), registrarCompraFiado: () => ok(null) },
    carrito: { recuperar: () => ok(null), guardar: () => ok(undefined) },
    config: {
      listarImpresoras: () => ok({ impresoras: ['TICKETERA'], actual: 'TICKETERA' }),
      obtenerComercio: () => ok({ nombre: 'Prueba', ruc: '80012345-1' }),
    },
    productos: {
      obtener: (codigo: string) => ok(productos.find((p) => p.codigo_barras === codigo) ?? null),
      buscar: () => ok([]),
      listar: () => ok(productos),
    },
    offline: { verificarConexion: () => ok(true), guardarVenta: () => ok(true) },
    ventas: { registrar: () => ok({ id_venta: 1 }) },
    ticket: { imprimir: () => ok(undefined) },
  };
}

function montar(productos: Producto[] = [yerba]) {
  // @ts-expect-error el stub cubre solo lo que esta pantalla usa
  window.api = stubApi(productos);
  return render(
    <VentaPOS idUsuario={1} nombreCajero="Cajero de prueba" conectado pendientes={0} />,
  );
}

/** El input de escaneo, que es el que nunca puede perder el foco. */
const inputEscaneo = () => document.getElementById('escaneo') as HTMLInputElement;

/** Escanea como lo hace el lector USB: escribe el código y manda Enter. */
async function escanear(usuario: ReturnType<typeof userEvent.setup>, codigo: string) {
  await usuario.type(inputEscaneo(), `${codigo}{Enter}`);
}

/**
 * Cuántas líneas del carrito tienen ese código.
 *
 * Se cuenta dentro de la tabla del carrito y no en toda la pantalla: el nombre
 * del producto también aparece en el panel del último ítem, y buscarlo suelto
 * encuentra los dos.
 */
function lineasConCodigo(codigo: string): number {
  const tabla = screen.queryByText('Código EAN')?.closest('table');
  if (!tabla) return 0;
  return within(tabla as HTMLElement).queryAllByText(codigo).length;
}

beforeEach(() => {
  vi.useRealTimers();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('VentaPOS — el foco del input de escaneo', () => {
  it('el input toma el foco al montar', async () => {
    montar();
    await waitFor(() => expect(inputEscaneo()).toHaveFocus());
  });

  it('el foco vuelve al input despues de escanear', async () => {
    // Es la condicion que hace que el lector siga funcionando lectura tras
    // lectura sin que el cajero toque nada.
    const usuario = userEvent.setup();
    montar();
    await waitFor(() => expect(inputEscaneo()).toHaveFocus());

    await escanear(usuario, '7790001');

    await waitFor(() => expect(inputEscaneo()).toHaveFocus());
  });

  it('el input queda vacio despues de cada lectura', async () => {
    // Si no se limpia, la lectura siguiente se concatena con la anterior.
    const usuario = userEvent.setup();
    montar();
    await waitFor(() => expect(inputEscaneo()).toHaveFocus());

    await escanear(usuario, '7790001');

    await waitFor(() => expect(inputEscaneo().value).toBe(''));
  });
});

describe('VentaPOS — la lectura de codigos', () => {
  it('escanear un codigo conocido agrega el producto al carrito', async () => {
    const usuario = userEvent.setup();
    montar();
    await waitFor(() => expect(inputEscaneo()).toHaveFocus());

    await escanear(usuario, '7790001');

    await waitFor(() => expect(lineasConCodigo('7790001')).toBe(1));
  });

  it('escanear dos veces el mismo producto suma en la misma linea', async () => {
    // Es lo que mas pasa en el mostrador: dos unidades del mismo producto no
    // pueden abrir dos renglones.
    const usuario = userEvent.setup();
    montar();
    await waitFor(() => expect(inputEscaneo()).toHaveFocus());

    await escanear(usuario, '7790001');
    await waitFor(() => expect(lineasConCodigo('7790001')).toBe(1));
    await escanear(usuario, '7790001');

    await waitFor(() => expect(inputEscaneo().value).toBe(''));
    expect(lineasConCodigo('7790001')).toBe(1);
  });

  it('un codigo desconocido no agrega nada al carrito', async () => {
    const usuario = userEvent.setup();
    montar();
    await waitFor(() => expect(inputEscaneo()).toHaveFocus());

    await escanear(usuario, '0000000');

    await waitFor(() => expect(inputEscaneo().value).toBe(''));
    expect(lineasConCodigo('7790001')).toBe(0);
  });
});

describe('VentaPOS — el modo cantidad (*)', () => {
  it('con el carrito vacio, * no borra ni rompe nada', async () => {
    // El manejador sale temprano: sin lineas no hay a que aplicarle la cantidad.
    const usuario = userEvent.setup();
    montar();
    await waitFor(() => expect(inputEscaneo()).toHaveFocus());

    await usuario.type(inputEscaneo(), '*');

    expect(inputEscaneo()).toBeInTheDocument();
    expect(inputEscaneo()).toHaveFocus();
  });

  it('con un producto en el carrito, * y una cantidad la fijan', async () => {
    const usuario = userEvent.setup();
    montar();
    await waitFor(() => expect(inputEscaneo()).toHaveFocus());

    await escanear(usuario, '7790001');
    await waitFor(() => expect(lineasConCodigo('7790001')).toBe(1));

    await usuario.type(inputEscaneo(), '*');
    await usuario.type(inputEscaneo(), '3{Enter}');

    expect(await screen.findByText(/Cantidad actualizada a 3/)).toBeInTheDocument();
  });

  it('la cantidad se recorta contra el stock', async () => {
    // El producto de prueba tiene 8. Pedir 50 deja 8, no un error.
    const usuario = userEvent.setup();
    montar();
    await waitFor(() => expect(inputEscaneo()).toHaveFocus());

    await escanear(usuario, '7790001');
    await waitFor(() => expect(lineasConCodigo('7790001')).toBe(1));

    await usuario.type(inputEscaneo(), '*');
    await usuario.type(inputEscaneo(), '50{Enter}');

    // El mensaje repite lo tipeado; lo que importa es que la linea quedo en 8.
    await screen.findByText(/Cantidad actualizada a 50/);
    await waitFor(() => expect(inputEscaneo().value).toBe(''));
  });

  it('en modo cantidad el input solo acepta digitos', async () => {
    // Es lo que evita que una lectura del lector se cuele como cantidad.
    const usuario = userEvent.setup();
    montar();
    await waitFor(() => expect(inputEscaneo()).toHaveFocus());

    await escanear(usuario, '7790001');
    await waitFor(() => expect(lineasConCodigo('7790001')).toBe(1));

    await usuario.type(inputEscaneo(), '*');
    await usuario.type(inputEscaneo(), 'abc12');

    await waitFor(() => expect(inputEscaneo().value).toBe('12'));
  });
});
