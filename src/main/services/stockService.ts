import { obtenerClienteSupabase } from './baseService';

export interface ProductoAlerta {
  codigo_barras: string;
  nombre: string;
  stock: number;
  precio_venta: number;
}

const LIMITE_CRITICO = 5;

export async function obtenerStockCritico(limite = LIMITE_CRITICO): Promise<ProductoAlerta[]> {
  const supabase = obtenerClienteSupabase();
  const { data, error } = await supabase
    .from('productos')
    .select('codigo_barras, nombre, stock, precio_venta')
    .lt('stock', limite)
    .order('stock', { ascending: true });

  if (error) throw new Error(`Error al consultar stock crítico: ${error.message}`);
  return (data ?? []) as ProductoAlerta[];
}
