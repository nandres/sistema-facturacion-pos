import { obtenerClienteSupabase } from './baseService';

export interface ProveedorDB {
  id_proveedor: number;
  ruc: string | null;
  razon_social: string;
  telefono: string | null;
  contacto: string | null;
  activo: boolean;
}

export interface DetalleCompraDB {
  id_detalle: number;
  id_compra: number;
  codigo_barras: string;
  cantidad: number;
  precio_costo: number;
}

export interface CompraDB {
  id_compra: number;
  id_proveedor: number | null;
  fecha_hora: string;
  total: number;
  factura_numero: string | null;
}

export interface LineaCompraInput {
  codigo_barras: string;
  cantidad: number;
  precio_costo: number;
}

export async function listarProveedores(): Promise<ProveedorDB[]> {
  const supabase = obtenerClienteSupabase();
  const { data, error } = await supabase
    .from('proveedores')
    .select('*')
    .order('razon_social', { ascending: true });
  if (error) throw new Error(`Error al listar proveedores: ${error.message}`);
  return (data ?? []) as ProveedorDB[];
}

export async function crearProveedor(datos: {
  ruc?: string;
  razon_social: string;
  telefono?: string;
  contacto?: string;
}): Promise<ProveedorDB> {
  const supabase = obtenerClienteSupabase();
  const { data, error } = await supabase
    .from('proveedores')
    .insert({
      ruc: datos.ruc || null,
      razon_social: datos.razon_social,
      telefono: datos.telefono || null,
      contacto: datos.contacto || null,
    })
    .select()
    .single();
  if (error) throw new Error(`Error al crear proveedor: ${error.message}`);
  return data as ProveedorDB;
}

// Delega en la RPC `registrar_compra` (migración 20260828000005): cabecera,
// detalle e ingreso de stock en una sola transacción, con la fila del producto
// bloqueada y el stock sumado por expresión.
//
// Antes eran tres pasos sueltos con un read-modify-write del stock: una compra
// y una venta simultáneas del mismo producto se pisaban, un UPDATE fallido no
// se miraba, y un código de barras que no existía en el catálogo entraba al
// detalle sin mover stock y devolvía éxito igual.
export async function registrarCompra(datos: {
  id_proveedor?: number;
  factura_numero?: string;
  lineas: LineaCompraInput[];
}, idUsuario?: number): Promise<CompraDB> {
  const supabase = obtenerClienteSupabase();

  // `_sesion`: valida que quien la registra sea administrador cuando hay token.
  const { data, error } = await supabase.rpc('registrar_compra_sesion', {
    p_compra: {
      id_proveedor: datos.id_proveedor ?? null,
      factura_numero: datos.factura_numero ?? null,
      id_usuario: idUsuario ?? null,
      lineas: datos.lineas,
    },
  });

  if (error) throw new Error(`Error al registrar la compra: ${error.message}`);
  if (!data) throw new Error('La RPC registrar_compra no devolvió datos.');

  return data as CompraDB;
}

export async function listarCompras(desde?: string, hasta?: string, idUsuario?: number): Promise<CompraDB[]> {
  const supabase = obtenerClienteSupabase();
  let query = supabase
    .from('compras')
    .select('*')
    .order('fecha_hora', { ascending: false });

  if (desde) query = query.gte('fecha_hora', desde);
  if (hasta) query = query.lte('fecha_hora', hasta);
  if (idUsuario) query = query.eq('id_usuario', idUsuario);

  const { data, error } = await query;
  if (error) throw new Error(`Error al listar compras: ${error.message}`);
  return (data ?? []) as CompraDB[];
}
