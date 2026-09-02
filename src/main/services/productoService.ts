import { obtenerClienteSupabase } from './baseService';
import { getProductoCache } from './offlineService';
import type {
  Producto,
  CrearProductoInput,
  ActualizarProductoInput,
} from '../../shared/types/productos';

export type { Producto, CrearProductoInput, ActualizarProductoInput };

const TABLA = 'productos';

export class ProductoNoEncontradoError extends Error {
  constructor(public readonly codigoBarras: string) {
    super(`Producto no encontrado: ${codigoBarras}`);
    this.name = 'ProductoNoEncontradoError';
  }
}

export async function obtenerProducto(
  codigoBarras: string,
): Promise<Producto | null> {
  try {
    const supabase = obtenerClienteSupabase();
    const { data, error } = await supabase
      .from(TABLA)
      .select('*')
      .eq('codigo_barras', codigoBarras)
      .maybeSingle();

    if (error) {
      throw new Error(`Error al consultar producto ${codigoBarras}: ${error.message}`);
    }
    return (data as Producto | null) ?? null;
  } catch (err) {
    const fromCache = getProductoCache(codigoBarras);
    if (fromCache) {
      console.warn(`[productoService] fallback a caché para ${codigoBarras}`);
      return fromCache;
    }
    console.error(`[productoService.obtenerProducto:${codigoBarras}]`, err);
    throw err;
  }
}

// Variante que tira ProductoNoEncontradoError si no existe. Útil en
// contextos donde el caller ya validó upstream y la ausencia es invariant
// violation, no un caso de UX (p. ej., revalidación previa al cobro).
export async function obtenerProductoObligatorio(
  codigoBarras: string,
): Promise<Producto> {
  const producto = await obtenerProducto(codigoBarras);
  if (!producto) {
    throw new ProductoNoEncontradoError(codigoBarras);
  }
  return producto;
}

export async function actualizarCodigoBarras(codigoActual: string, nuevoCodigo: string): Promise<void> {
  const supabase = obtenerClienteSupabase();
  const { error } = await supabase
    .from(TABLA)
    .update({ codigo_barras: nuevoCodigo })
    .eq('codigo_barras', codigoActual);
  if (error) {
    throw new Error(`Error al actualizar código de barras: ${error.message}`);
  }
}

// PostgREST trata la coma, el parentesis y el punto como separadores dentro de
// un filtro `or`. Encerramos el patron entre comillas y escapamos lo que rompa
// la sintaxis, para que un nombre como "Coca 2,25 L" no parta la consulta.
function patronBusqueda(termino: string): string {
  return `"%${termino.replace(/[\\"]/g, '\\$&')}%"`;
}

export async function listarProductos(termino?: string): Promise<Producto[]> {
  const supabase = obtenerClienteSupabase();
  let query = supabase.from(TABLA).select('*').eq('activo', true).order('nombre', { ascending: true });
  if (termino && termino.trim()) {
    const patron = patronBusqueda(termino.trim());
    query = query.or(`nombre.ilike.${patron},codigo_barras.ilike.${patron}`);
  }
  const { data, error } = await query;
  if (error) throw new Error(`Error al listar productos: ${error.message}`);
  return (data ?? []) as Producto[];
}

// Busqueda para el desplegable de caja. Va contra la base para que el precio y
// el stock sean los de este momento: el cajero puede agregar la linea desde
// aca, y una lectura vieja se cobra mal. Si no hay conexion, quien llama cae
// al cache (ver ipc/index.ts).
export async function buscarProductos(termino: string, limite = 8): Promise<Producto[]> {
  const t = termino.trim();
  if (t === '') return [];
  const supabase = obtenerClienteSupabase();
  const patron = patronBusqueda(t);
  const { data, error } = await supabase
    .from(TABLA)
    .select('*')
    .eq('activo', true)
    .or(`nombre.ilike.${patron},codigo_barras.ilike.${patron}`)
    .order('nombre', { ascending: true })
    .limit(limite);
  if (error) throw new Error(`Error al buscar productos: ${error.message}`);
  return (data ?? []) as Producto[];
}

export async function eliminarProducto(codigoBarras: string): Promise<void> {
  const supabase = obtenerClienteSupabase();
  const { error } = await supabase
    .from(TABLA)
    .update({ activo: false })
    .eq('codigo_barras', codigoBarras);
  if (error) throw new Error(`Error al eliminar producto: ${error.message}`);
}

export async function actualizarProducto(codigoBarras: string, cambios: ActualizarProductoInput): Promise<void> {
  const supabase = obtenerClienteSupabase();
  const { error } = await supabase.from(TABLA).update(cambios).eq('codigo_barras', codigoBarras);
  if (error) throw new Error(`Error al actualizar producto: ${error.message}`);
}

export async function crearProducto(input: CrearProductoInput): Promise<Producto> {
  const supabase = obtenerClienteSupabase();
  const { data, error } = await supabase.from(TABLA).insert(input).select().maybeSingle();
  if (error) throw new Error(`Error al crear producto: ${error.message}`);
  if (!data) throw new Error('No se pudo crear el producto');
  return data as Producto;
}
