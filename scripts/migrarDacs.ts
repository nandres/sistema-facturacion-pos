import { execSync } from 'child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';

config({ path: join(import.meta.dirname, '..', '.env') });

const SQLCMD = 'sqlcmd -S "(localdb)\\Migracion" -d "dacsoft3" -W -h -1 -s","';
const OUT_DIR = join(import.meta.dirname, '..', 'Backup', 'migracion');

function query(sql: string): string {
  // Build a sqlcmd command that outputs ISO dates and no headers
  const cmd = `${SQLCMD} -Q "${sql.replace(/"/g, '\\"')}" 2>&1`;
  return execSync(cmd, { encoding: 'utf-8', timeout: 60000 }).trim();
}

function exportToJson(name: string, sql: string) {
  const raw = query(sql);
  // sqlcmd with -s"," outputs: val1,"val2","val3"
  // Parse simple format: remove quotes, split by comma
  const lines = raw.split('\n').filter(Boolean);
  const rows = lines.map(line => {
    // Remove outer quotes if present
    const s = line.trim();
    const parts: string[] = [];
    let current = '';
    let inQuote = false;
    for (const ch of s) {
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { parts.push(current.trim()); current = ''; continue; }
      current += ch;
    }
    if (current) parts.push(current.trim());
    return parts;
  });
  writeFileSync(join(OUT_DIR, `${name}.json`), JSON.stringify(rows, null, 2));
  console.log(`  ${name}: ${rows.length} registros`);
}

async function exportData() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  console.log('\n🔍 Exportando datos del sistema DACS...\n');

  // Products
  exportToJson('productos', `
    SELECT codigo, codbarra, nombre, contado, prcostogs, stockactual, por_iva
    FROM Mercaderia ORDER BY codigo
  `);

  // Clients
  exportToJson('clientes', `
    SELECT codigo, nombre, ruc, direccion, telefono, celular, limitecredito, saldoAfavor
    FROM Clientes ORDER BY codigo
  `);

  // Vendors
  exportToJson('proveedores', `
    SELECT codigo, nombre, ruc, direccion, telefono
    FROM Proveedores ORDER BY codigo
  `);

  // Sales
  exportToJson('ventas', `
    SELECT numero, serie, fecha, clientes, total, efectivo, vuelto, anulado, NumeroFactura, sub_total_gr, iva
    FROM Venta ORDER BY numero
  `);

  // Sale details with barcode
  exportToJson('detalle_ventas', `
    SELECT dv.numero, dv.serie, dv.linea, dv.codmer, m.codbarra, dv.detalle, dv.cantidad, dv.unitario, dv.total
    FROM DVenta dv LEFT JOIN Mercaderia m ON dv.codmer = m.codigo
    ORDER BY dv.numero, dv.linea
  `);

  console.log(`\n📁 Datos exportados a: ${OUT_DIR}`);
}

async function uploadProducts() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey) { console.log('⚠️  Supabase no configurada'); return; }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const rows: string[][] = JSON.parse(
    readFileSync(join(OUT_DIR, 'productos.json'), 'utf-8')
  );

  let ok = 0, err = 0;
  for (const r of rows) {
    const c = r[1]; const n = r[2];
    if (!c || !n) { err++; continue; }
    const codbarra = c.toString().trim();
    if (!codbarra) { err++; continue; }
    const payload = {
      codigo_barras: codbarra,
      nombre: n.toString().trim(),
      precio_venta: Math.round(Number(r[3]) || 0),
      precio_costo: Math.round(Number(r[4]) || 0),
      stock: Math.round(Number(r[5]) || 0),
      iva: Math.round(Number(r[6]) || 0),
    };
    const { error } = await supabase.from('productos').upsert(payload, { onConflict: 'codigo_barras' });
    if (error) { console.error(`  ✗ ${payload.codigo_barras}: ${error.message}`); err++; }
    else ok++;
  }
  console.log(`\n📤 Productos subidos: ${ok} ok, ${err} errores`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--solo-subir')) {
    await uploadProducts();
    return;
  }

  await exportData();

  if (args.includes('--subir')) {
    await uploadProducts();
  }

  console.log('\n✅ Migración completada.');
}

main().catch(console.error);
