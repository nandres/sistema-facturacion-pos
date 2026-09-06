import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VentaInput } from '../../shared/types/ventas';

// ── POR QUÉ ESTA PRUEBA EXISTE ─────────────────────────────────────────────
//
// `VentaPOS` encolaba la venta sin mirar si se había guardado: llamaba a
// `guardarVenta`, descartaba el `Resultado`, anunciaba «Venta guardada
// localmente» y limpiaba el carrito. Si la escritura fallaba, la plata ya
// estaba cobrada, la mercadería afuera, y la venta en ningún lado.
//
// La pantalla ya mira el resultado. Lo que se fija acá es lo que hace posible
// que se entere: que un fallo al escribir **salga** de este servicio en vez de
// quedar tragado adentro. Si alguien envuelve `guardarVentaOffline` en un
// try/catch silencioso, la corrección de la pantalla se vuelve decorativa y
// nada lo delataría hasta el próximo corte de internet.
//
// De paso queda fijado el sello de idempotencia, que es la otra mitad de la
// protección: sin él, un reintento registra la misma venta dos veces.

// Un electron-store en memoria: alcanza para leer lo guardado y, sobre todo,
// para hacer fallar la escritura a propósito. El disco lleno, los permisos y el
// antivirus con el archivo tomado llegan acá todos con la misma forma.
const datos: Record<string, unknown> = {};
let fallarEscritura = false;

vi.mock('electron-store', () => ({
  default: class StoreFalso {
    constructor(opciones: { defaults?: Record<string, unknown> }) {
      Object.assign(datos, opciones.defaults ?? {});
    }
    get(clave: string): unknown {
      return datos[clave];
    }
    set(clave: string, valor: unknown): void {
      if (fallarEscritura) throw new Error('EACCES: permission denied, open cache.json');
      datos[clave] = valor;
    }
  },
}));

// No se consulta la base en ninguna de estas pruebas.
vi.mock('./supabaseClient', () => ({
  obtenerClienteSupabase: () => {
    throw new Error('las pruebas de offlineService no hablan con la base');
  },
}));

const { guardarVentaOffline, getVentasPendientes, hayVentasPendientes } =
  await import('./offlineService');

const venta: VentaInput = {
  cabecera: {
    total_pagado: 13000,
    monto_recibido: 20000,
    tipo_pago: 'efectivo',
    pagos: [{ medio_pago: 'efectivo', monto: 13000 }],
  },
  lineas: [{ codigo_barras: '7840001', cantidad: 2, precio_unitario: 6500 }],
};

beforeEach(() => {
  datos.ventasPendientes = [];
  datos.ventasFallidas = [];
  fallarEscritura = false;
});

describe('guardarVentaOffline', () => {
  it('deja la venta en la cola de pendientes', () => {
    guardarVentaOffline(venta);
    expect(getVentasPendientes()).toHaveLength(1);
    expect(hayVentasPendientes()).toBe(true);
  });

  it('conserva la venta tal cual se cobró', () => {
    const pendiente = guardarVentaOffline(venta);
    expect(pendiente.payload.lineas).toEqual(venta.lineas);
    expect(pendiente.payload.cabecera.total_pagado).toBe(13000);
    expect(pendiente.payload.cabecera.pagos).toEqual(venta.cabecera.pagos);
  });

  // Sin esto, una respuesta perdida --la transacción se confirmó del lado de la
  // base pero la respuesta no volvió-- hace que el reintento registre la misma
  // venta otra vez. Ver 20260901000001_venta_idempotente.sql.
  it('estampa la referencia de idempotencia al encolar, no al sincronizar', () => {
    const pendiente = guardarVentaOffline(venta);
    expect(pendiente.payload.cabecera.referencia_externa).toBe(pendiente.idTemp);
    expect(pendiente.idTemp).toBeTruthy();
  });

  it('le da una referencia distinta a cada venta', () => {
    const a = guardarVentaOffline(venta);
    const b = guardarVentaOffline(venta);
    expect(a.idTemp).not.toBe(b.idTemp);
  });

  it('arranca con cero intentos', () => {
    expect(guardarVentaOffline(venta).intentos).toBe(0);
  });

  // El caso que importa: es lo que le permite a la pantalla no mentirle al
  // cajero.
  it('propaga el fallo de escritura en vez de tragárselo', () => {
    fallarEscritura = true;
    expect(() => guardarVentaOffline(venta)).toThrow(/EACCES/);
  });

  it('si la escritura falla, la venta no queda a medias en la cola', () => {
    fallarEscritura = true;
    expect(() => guardarVentaOffline(venta)).toThrow();
    fallarEscritura = false;
    expect(getVentasPendientes()).toHaveLength(0);
  });
});
