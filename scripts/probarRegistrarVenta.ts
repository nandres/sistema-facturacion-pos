// Verificación end-to-end de la RPC registrar_venta + ventaService.
// Siembra productos de prueba, ejercita el caso feliz y los 4 códigos
// de error (P0001-P0004), y valida atomicidad. Limpia los datos en
// el bloque finally aunque alguna aserción falle.
//
// Ejecución: npm run probar-registrar-venta
// Requiere: stack local Supabase corriendo y .env configurado.

import 'dotenv/config';
import { strict as assert } from 'node:assert';
import { obtenerClienteSupabase } from '../src/main/services/baseService';
import { obtenerProducto } from '../src/main/services/productoService';
import {
  registrarVenta,
  VentaError,
  type VentaInput,
} from '../src/main/services/ventaService';
import type { PagoInput } from '../src/shared/types/ventas';

const CODIGO_A = 'TEST-PROD-01';
const CODIGO_B = 'TEST-PROD-02';
const CODIGO_INEXISTENTE = 'TEST-INEXISTENTE-99999';

const STOCK_INICIAL_A = 10;
const STOCK_INICIAL_B = 5;
const PRECIO_A = 5000;
const PRECIO_B = 3000;

// IDs de las ventas que cree alguna prueba — se borran en cleanup.
const ventasCreadas: number[] = [];

// El desglose por medio de pago pasó a ser obligatorio en la cabecera con
// `20260828000001_pagos_en_transaccion_y_arqueo.sql`: `registrar_venta` inserta
// una fila por medio y el arqueo las suma desde ahí. Este script quedó escrito
// antes de eso, así que mandaba ventas sin desglose.
//
// Todos los casos de acá cobran en efectivo, así que el desglose es una sola
// línea por el total. Se arma con esto para no repetir en seis lugares la misma
// expresión del total, que es justo donde se cuelan las diferencias.
function enEfectivo(monto: number): PagoInput[] {
  return [{ medio_pago: 'efectivo', monto }];
}

async function obtenerStock(codigo: string): Promise<number> {
  const p = await obtenerProducto(codigo);
  if (!p) throw new Error(`Inesperado: producto ${codigo} no existe`);
  return p.stock;
}

async function sembrarProductos(): Promise<void> {
  const supabase = obtenerClienteSupabase();
  // upsert por idempotencia: si una corrida previa crasheó antes del
  // cleanup, este script sigue funcionando sin intervención manual.
  const { error } = await supabase.from('productos').upsert([
    {
      codigo_barras: CODIGO_A,
      nombre: 'Producto Test A',
      precio_venta: PRECIO_A,
      precio_costo: 3000,
      stock: STOCK_INICIAL_A,
      iva: 10,
    },
    {
      codigo_barras: CODIGO_B,
      nombre: 'Producto Test B',
      precio_venta: PRECIO_B,
      precio_costo: 2000,
      stock: STOCK_INICIAL_B,
      iva: 10,
    },
  ]);
  if (error) throw new Error(`Error sembrando productos: ${error.message}`);
  console.log('[seed] productos creados');
}

async function limpiarDatos(): Promise<void> {
  const supabase = obtenerClienteSupabase();

  if (ventasCreadas.length > 0) {
    // CASCADE en detalle_ventas se encarga del detalle.
    const { error } = await supabase
      .from('ventas')
      .delete()
      .in('id_venta', ventasCreadas);
    if (error) console.error('[cleanup] ventas:', error.message);
  }

  const { error } = await supabase
    .from('productos')
    .delete()
    .in('codigo_barras', [CODIGO_A, CODIGO_B]);
  if (error) console.error('[cleanup] productos:', error.message);

  console.log('[cleanup] datos de prueba eliminados');
}

async function probarCasoFeliz(): Promise<void> {
  const input: VentaInput = {
    cabecera: {
      total_pagado: 2 * PRECIO_A + 1 * PRECIO_B,
      monto_recibido: 20000,
      tipo_pago: 'efectivo',
      pagos: enEfectivo(2 * PRECIO_A + 1 * PRECIO_B),
    },
    lineas: [
      { codigo_barras: CODIGO_A, cantidad: 2, precio_unitario: PRECIO_A },
      { codigo_barras: CODIGO_B, cantidad: 1, precio_unitario: PRECIO_B },
    ],
  };

  const resultado = await registrarVenta(input);
  ventasCreadas.push(resultado.venta.id_venta);

  assert.ok(resultado.venta.id_venta > 0, 'id_venta debe ser positivo');
  assert.equal(resultado.venta.total_pagado, 13000);
  assert.equal(resultado.venta.monto_recibido, 20000);
  assert.equal(resultado.venta.vuelto, 7000, 'vuelto = recibido - total');
  assert.equal(resultado.venta.tipo_pago, 'efectivo');
  assert.equal(resultado.lineas.length, 2);

  assert.equal(await obtenerStock(CODIGO_A), STOCK_INICIAL_A - 2);
  assert.equal(await obtenerStock(CODIGO_B), STOCK_INICIAL_B - 1);

  console.log('[OK] caso feliz: venta registrada, stock descontado, vuelto correcto');
}

async function probarP0001LineasVacias(): Promise<void> {
  const stockAntes = await obtenerStock(CODIGO_A);
  try {
    await registrarVenta({
      cabecera: { total_pagado: 0, monto_recibido: 0, tipo_pago: 'efectivo', pagos: enEfectivo(0) },
      lineas: [],
    });
    throw new Error('Se esperaba VentaError P0001 pero la llamada tuvo éxito');
  } catch (err) {
    assert.ok(err instanceof VentaError, `esperaba VentaError, recibí: ${err}`);
    assert.equal(err.codigo, 'P0001', `esperaba P0001, recibí ${err.codigo}`);
  }
  assert.equal(
    await obtenerStock(CODIGO_A),
    stockAntes,
    'stock NO debe cambiar tras P0001',
  );
  console.log('[OK] P0001 (líneas vacías) + atomicidad');
}

async function probarP0002TotalMismatch(): Promise<void> {
  const stockAntes = await obtenerStock(CODIGO_A);
  try {
    await registrarVenta({
      cabecera: { total_pagado: 9999, monto_recibido: 10000, tipo_pago: 'efectivo', pagos: enEfectivo(9999) },
      lineas: [
        { codigo_barras: CODIGO_A, cantidad: 1, precio_unitario: PRECIO_A }, // suma real 5000
      ],
    });
    throw new Error('Se esperaba VentaError P0002');
  } catch (err) {
    assert.ok(err instanceof VentaError);
    assert.equal(err.codigo, 'P0002');
  }
  assert.equal(await obtenerStock(CODIGO_A), stockAntes);
  console.log('[OK] P0002 (total mismatch) + atomicidad');
}

async function probarP0003ProductoInexistente(): Promise<void> {
  const stockAntes = await obtenerStock(CODIGO_A);
  try {
    await registrarVenta({
      cabecera: { total_pagado: 5000, monto_recibido: 5000, tipo_pago: 'efectivo', pagos: enEfectivo(5000) },
      lineas: [
        { codigo_barras: CODIGO_INEXISTENTE, cantidad: 1, precio_unitario: 5000 },
      ],
    });
    throw new Error('Se esperaba VentaError P0003');
  } catch (err) {
    assert.ok(err instanceof VentaError);
    assert.equal(err.codigo, 'P0003');
  }
  assert.equal(await obtenerStock(CODIGO_A), stockAntes);
  console.log('[OK] P0003 (producto inexistente)');
}

async function probarP0004StockInsuficiente(): Promise<void> {
  const stockAntes = await obtenerStock(CODIGO_A);
  const cantidadExagerada = stockAntes + 1000;
  try {
    await registrarVenta({
      cabecera: {
        total_pagado: cantidadExagerada * PRECIO_A,
        monto_recibido: cantidadExagerada * PRECIO_A,
        tipo_pago: 'efectivo',
        pagos: enEfectivo(cantidadExagerada * PRECIO_A),
      },
      lineas: [
        { codigo_barras: CODIGO_A, cantidad: cantidadExagerada, precio_unitario: PRECIO_A },
      ],
    });
    throw new Error('Se esperaba VentaError P0004');
  } catch (err) {
    assert.ok(err instanceof VentaError);
    assert.equal(err.codigo, 'P0004');
  }
  assert.equal(
    await obtenerStock(CODIGO_A),
    stockAntes,
    'stock NO debe cambiar tras P0004 — rollback de RPC',
  );
  console.log('[OK] P0004 (stock insuficiente) + atomicidad');
}

async function probarAtomicidadEntreLineas(): Promise<void> {
  // Caso interesante: venta con DOS líneas donde la segunda falla.
  // La primera línea (válida) tampoco debe persistirse — rollback total.
  const stockAntesA = await obtenerStock(CODIGO_A);
  const stockAntesB = await obtenerStock(CODIGO_B);

  const cantidadFallida = stockAntesB + 100;
  try {
    await registrarVenta({
      cabecera: {
        total_pagado: 1 * PRECIO_A + cantidadFallida * PRECIO_B,
        monto_recibido: 1 * PRECIO_A + cantidadFallida * PRECIO_B,
        tipo_pago: 'efectivo',
        pagos: enEfectivo(1 * PRECIO_A + cantidadFallida * PRECIO_B),
      },
      lineas: [
        { codigo_barras: CODIGO_A, cantidad: 1, precio_unitario: PRECIO_A },                  // válida
        { codigo_barras: CODIGO_B, cantidad: cantidadFallida, precio_unitario: PRECIO_B },    // falla
      ],
    });
    throw new Error('Se esperaba VentaError P0004 en línea 2');
  } catch (err) {
    assert.ok(err instanceof VentaError);
    assert.equal(err.codigo, 'P0004');
  }

  assert.equal(
    await obtenerStock(CODIGO_A),
    stockAntesA,
    'línea válida tampoco debe persistir si una posterior falla',
  );
  assert.equal(await obtenerStock(CODIGO_B), stockAntesB);
  console.log('[OK] Atomicidad inter-líneas: rollback total ante falla parcial');
}

async function main(): Promise<void> {
  console.log('=== Pruebas de registrar_venta ===\n');
  try {
    await sembrarProductos();
    await probarCasoFeliz();
    await probarP0001LineasVacias();
    await probarP0002TotalMismatch();
    await probarP0003ProductoInexistente();
    await probarP0004StockInsuficiente();
    await probarAtomicidadEntreLineas();
    console.log('\n=== Todas las pruebas pasaron ===');
  } finally {
    await limpiarDatos();
  }
}

main().catch((err) => {
  console.error('\nFALLO DE PRUEBA:', err);
  process.exitCode = 1;
});
