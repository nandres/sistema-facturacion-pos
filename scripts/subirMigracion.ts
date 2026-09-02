import { readFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: join(import.meta.dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY requeridos en .env');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);
const migDir = join(import.meta.dirname, '..', 'Backup', 'migracion');

function leerJSON(nombre: string) {
  const raw = readFileSync(join(migDir, nombre), 'utf-8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

/**
 * Una fila del export de DACS.
 *
 * El JSON viene del sistema anterior y no tiene esquema declarado: cada tabla
 * trae las columnas que traiga. Lo que si es cierto de todas es que los valores
 * son escalares --el export no anida-- y eso alcanza para leerlas sin apagar el
 * chequeo de tipos, que era lo que hacia el `any[]` de antes.
 */
type FilaDacs = Record<string, string | number | boolean | null | undefined>;

async function subirProductos() {
  let rows = leerJSON('productos.json') as FilaDacs[];
  if (!Array.isArray(rows)) rows = [rows];
  const batch: Record<string, unknown>[] = [];
  let skip = 0;

  for (const r of rows) {
    const bar = (r.codbarra ?? '').toString().trim();
    if (!bar) { skip++; continue; }
    batch.push({
      codigo_barras: bar,
      nombre: (r.nombre ?? '').toString().trim() || bar,
      precio_venta: Math.round(Number(r.contado) || 0),
      precio_costo: Math.round(Number(r.prcostogs) || 0),
      stock: Math.round(Number(r.stockactual) || 0),
      iva: Math.round(Number(r.por_iva) || 0),
    });

    // Upsert in batches of 100
    if (batch.length >= 100) {
      const { error } = await supabase.from('productos').upsert(batch, { onConflict: 'codigo_barras' });
      if (error) console.error('  ✗ batch error:', error.message);
      else process.stdout.write('.');
      batch.length = 0;
    }
  }

  // Last batch
  if (batch.length > 0) {
    const { error } = await supabase.from('productos').upsert(batch, { onConflict: 'codigo_barras' });
    if (error) console.error('  ✗ batch error:', error.message);
  }

  console.log(`\n  Productos: ${rows.length - skip} subidos, ${skip} sin código de barras`);
}

async function subirClientes() {
  let rows = leerJSON('clientes.json') as FilaDacs[];
  if (!Array.isArray(rows)) rows = [rows];
    const batch = rows
    .filter(r => (r.nombre ?? '').toString().trim())
    .map(r => ({
      nombre: (r.nombre ?? '').toString().trim(),
      ruc: ((r.ruc ?? '').toString().trim() || null),
      direccion: (r.direccion ?? '').toString().trim() || null,
      telefono: [(r.telefono ?? '').toString().trim(), (r.celular ?? '').toString().trim()].filter(Boolean).join(' / ') || null,
      limite_credito: Math.round(Number(r.limitecredito) || 0),
    }));

  if (batch.length > 0) {
    const { error } = await supabase.from('clientes').upsert(batch, {
      onConflict: 'ruc', ignoreDuplicates: true,
    });
    if (error) console.error('  ✗', error.message);
    else console.log(`  Clientes: ${batch.length} procesados`);
  }
}

async function subirProveedores() {
  let rows = leerJSON('proveedores.json') as FilaDacs[];
  if (!Array.isArray(rows)) rows = [rows];
    const batch = rows
    .filter(r => (r.nombre ?? '').toString().trim())
    .map(r => ({
      razon_social: (r.nombre ?? '').toString().trim(),
      ruc: ((r.ruc ?? '').toString().trim() || null),
      telefono: (r.telefono ?? '').toString().trim() || null,
    }));

  if (batch.length > 0) {
    const { error } = await supabase.from('proveedores').insert(batch);
    if (error) console.error('  ✗', error.message);
    else console.log(`  Proveedores: ${batch.length} subidos`);
  }
}

async function main() {
  console.log('\n📤 Subiendo datos a Supabase...\n');
  await subirProductos();
  await subirClientes();
  await subirProveedores();
  console.log('\n✅ Migración completada');
}

main().catch(console.error);
