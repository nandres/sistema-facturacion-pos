// Punto unico de acceso al cliente Supabase para toda la capa de servicios.
// Los archivos serviceXxx.ts importan desde aca, no desde supabaseClient directo.
// Permite agregar logging, metricas o interceptores en un solo lugar sin tocar
// cada servicio individualmente.
export { obtenerClienteSupabase } from './supabaseClient';
