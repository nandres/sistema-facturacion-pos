import { obtenerClienteSupabase } from './baseService';

export interface Categoria {
  id_categoria: number;
  nombre: string;
  color: string;
}

export async function listarCategorias(): Promise<Categoria[]> {
  const supabase = obtenerClienteSupabase();
  const { data, error } = await supabase.from('categorias').select('*').order('nombre', { ascending: true });
  if (error) throw new Error(`Error al listar categorías: ${error.message}`);
  return (data ?? []) as Categoria[];
}

export async function crearCategoria(nombre: string, color?: string): Promise<Categoria> {
  const supabase = obtenerClienteSupabase();
  const { data, error } = await supabase.from('categorias').insert({ nombre, color: color || '#6B7280' }).select().single();
  if (error) throw new Error(`Error al crear categoría: ${error.message}`);
  return data as Categoria;
}

export async function eliminarCategoria(id: number): Promise<void> {
  const supabase = obtenerClienteSupabase();
  const { error } = await supabase.from('categorias').delete().eq('id_categoria', id);
  if (error) throw new Error(`Error al eliminar categoría: ${error.message}`);
}
