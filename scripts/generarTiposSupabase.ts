// Regenera src/shared/types/database.ts desde el stack local de Supabase.
//
// Ejecución: npm run supabase:gen-types
// Requiere: el stack local de Supabase corriendo (supabase start).
//
// Por qué un script TS y no `supabase gen types ... > archivo` directo
// en package.json: en Windows el shell por defecto que usa npm puede
// escribir el archivo con encoding UTF-16 BOM (PowerShell 5.1) y romper
// el parser de TypeScript. Acá capturamos stdout y escribimos con
// UTF-8 explícito, cross-platform.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');
const DESTINO = path.join(PROJECT_ROOT, 'src', 'shared', 'types', 'database.ts');

// shell:true es necesario en Windows: supabase se instala vía npm como
// `supabase.cmd` y spawnSync sin shell no resuelve .cmd/.bat. El
// deprecation warning DEP0190 que dispara node es por riesgo de inyección
// cuando los args vienen de input externo; acá son literales hardcodeados,
// así que es benigno.
const r = spawnSync(
  'supabase',
  ['gen', 'types', 'typescript', '--local', '--schema', 'public'],
  { encoding: 'utf-8', shell: true },
);

if (r.status !== 0) {
  console.error('[supabase:gen-types] supabase CLI falló:');
  console.error(r.stderr || r.stdout);
  process.exit(r.status ?? 1);
}

const contenido = r.stdout;
if (!contenido || !contenido.includes('export type Database')) {
  console.error('[supabase:gen-types] La salida del CLI no contiene "export type Database".');
  console.error('¿El stack local está corriendo? Probá "supabase status".');
  process.exit(1);
}

fs.writeFileSync(DESTINO, contenido, { encoding: 'utf-8' });
const lineas = contenido.split('\n').length;
console.log(`[supabase:gen-types] OK: ${DESTINO} (${contenido.length} bytes, ${lineas} líneas)`);
