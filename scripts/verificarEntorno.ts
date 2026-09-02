import 'dotenv/config';
import { obtenerClienteSupabase } from '../src/main/services/supabaseClient.js';

async function verificarEntorno(): Promise<void> {
  console.log('Verificando entorno del Sistema de Facturación...\n');

  let supabase;
  try {
    supabase = obtenerClienteSupabase();
    console.log('[OK] Variables de entorno cargadas');
  } catch (error) {
    console.error('[ERROR] Configuración inválida:', (error as Error).message);
    process.exit(1);
  }

  try {
    const { count, error } = await supabase
      .from('productos')
      .select('*', { count: 'exact', head: true });

    if (error) {
      const codigo = (error as { code?: string }).code;
      const mensaje = error.message ?? '';

      if (codigo === '42P01' || mensaje.includes('does not exist')) {
        console.error('[ERROR] La tabla "productos" no existe en Supabase.');
        console.error('        Falta correr las migraciones en supabase/migrations/.');
        process.exit(1);
      }
      if (mensaje.includes('Invalid API key') || mensaje.includes('JWT')) {
        console.error('[ERROR] Credenciales inválidas. Revisá SUPABASE_ANON_KEY en .env.');
        process.exit(1);
      }
      console.error('[ERROR] Falla al consultar Supabase:', mensaje);
      process.exit(1);
    }

    console.log(`[OK] Conexión a Supabase establecida. Productos en BD: ${count ?? 0}`);
    console.log('\nEntorno listo.');
    return;
  } catch (error) {
    const mensaje = (error as Error).message;
    if (mensaje.includes('fetch failed') || mensaje.includes('ETIMEDOUT')) {
      console.error('[ERROR] Sin conexión o URL de Supabase incorrecta.');
      console.error('        Revisá SUPABASE_URL en .env y verificá tu conexión a internet.');
    } else {
      console.error('[ERROR] Inesperado:', mensaje);
    }
    process.exit(1);
  }
}

verificarEntorno();
