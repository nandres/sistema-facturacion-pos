import { obtenerClienteSupabase } from './baseService';

export interface EnvaseDB {
  id_envase: number;
  nombre: string;
  precio: number;
}

export async function listarEnvases(): Promise<EnvaseDB[]> {
  const supabase = obtenerClienteSupabase();
  const { data, error } = await supabase.from('envases').select('*').order('nombre', { ascending: true });
  if (error) throw new Error(`Error al listar envases: ${error.message}`);
  return (data ?? []) as EnvaseDB[];
}
