import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { join } from 'path';

config({ path: join(import.meta.dirname, '..', '.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env');
  process.exit(1);
}
const supabase = createClient(supabaseUrl, supabaseKey);

const { error } = await supabase
  .from('productos')
  .update({ stock: 50 })
  .neq('codigo_barras', '');

if (error) {
  console.error('Error al actualizar stock:', error.message);
  process.exit(1);
}

console.log('✓ Stock actualizado a 50 para todos los productos');
