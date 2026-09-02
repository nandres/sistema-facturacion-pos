import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const migDir = join(import.meta.dirname, '..', 'Backup', 'migracion');

function leerJSON(path: string) {
  const raw = readFileSync(path, 'utf-8').replace(/^\uFEFF/, '');
  return JSON.parse(raw);
}

// Product mapping: codigo -> codbarra
interface ProdRow { codigo: string; codbarra: string | null }
const prods = leerJSON(join(migDir, 'productos.json')) as ProdRow[];
const prodMap = new Map<string, string>();
for (const p of prods) {
  const c = (p.codigo ?? '').toString().trim();
  const b = (p.codbarra ?? '').toString().trim();
  if (c) prodMap.set(c, b || c);
}

// Parse CSV
const csv = readFileSync(join(migDir, 'detalle_ventas.csv'), 'utf-8');
const lines = csv.split('\n').filter(Boolean);
console.log(`  CSV lines: ${lines.length}`);

function parseCSV(line: string): string[] {
  const parts: string[] = [];
  let cur = ''; let inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ',' && !inQ) { parts.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur) parts.push(cur.trim());
  return parts;
}

const rows: Record<string, unknown>[] = [];
for (const line of lines) {
  const p = parseCSV(line);
  if (p.length < 8) continue;
  const codmer = (p[3] || '').trim();
  rows.push({
    numero: p[0] || null,
    serie: p[1] || null,
    linea: p[2] || null,
    codmer,
    codbarra: prodMap.get(codmer),
    detalle: p[4] || null,
    cantidad: parseFloat(p[5]) || 0,
    unitario: parseFloat(p[6]) || 0,
    total: parseFloat(p[7]) || 0,
  });
}

writeFileSync(join(migDir, 'detalle_ventas.json'), JSON.stringify(rows, null, 2));
console.log(`✅ detalle_ventas: ${rows.length} registros con barcode`);
