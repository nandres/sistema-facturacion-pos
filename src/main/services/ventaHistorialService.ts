import { obtenerClienteSupabase } from './baseService';
import type { Venta } from '../../shared/types/ventas';

export interface VentaResumen {
  id_venta: number;
  fecha_hora: string;
  total_pagado: number;
  monto_recibido: number;
  vuelto: number;
  tipo_pago: string;
  estado: string;
}

export interface VentaDetalleLinea {
  id_detalle: number;
  codigo_barras: string;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
}

export interface VentaDetalle {
  venta: VentaResumen;
  lineas: VentaDetalleLinea[];
}

const TABLA_VENTAS = 'ventas';

export async function listarVentas(desde?: string, hasta?: string, idUsuario?: number, limite = 500): Promise<VentaResumen[]> {
  const supabase = obtenerClienteSupabase();
  let query = supabase
    .from(TABLA_VENTAS)
    .select('id_venta, fecha_hora, total_pagado, monto_recibido, vuelto, tipo_pago, estado, pagos_venta(medio_pago, monto)')
    .order('fecha_hora', { ascending: false })
    .limit(limite);

  if (desde) query = query.gte('fecha_hora', desde);
  if (hasta) query = query.lte('fecha_hora', hasta);
  if (idUsuario) query = query.eq('id_usuario', idUsuario);

  const { data, error } = await query;
  if (error) throw new Error(`Error al listar ventas: ${error.message}`);

  // `efectivo` se deriva del desglose de pagos. Las ventas anteriores a la
  // migración 20260828000001 no tienen filas ahí, así que para esas se cae al
  // criterio viejo --el `tipo_pago` de la cabecera--, igual que hace
  // `cerrar_caja`. De ese modo la pantalla y el cierre dan el mismo número.
  type FilaConPagos = Omit<VentaResumen, 'efectivo'> & {
    pagos_venta?: { medio_pago: string; monto: number }[] | null;
  };

  return ((data ?? []) as FilaConPagos[]).map(({ pagos_venta, ...v }) => ({
    ...v,
    efectivo: pagos_venta && pagos_venta.length > 0
      ? pagos_venta.reduce((s, p) => s + (p.medio_pago === 'efectivo' ? Number(p.monto) : 0), 0)
      : v.tipo_pago === 'efectivo' ? v.total_pagado : 0,
  }));
}

export async function obtenerDetalleVenta(idVenta: number): Promise<VentaDetalle | null> {
  const supabase = obtenerClienteSupabase();

  const { data: venta, error: errV } = await supabase
    .from(TABLA_VENTAS)
    .select('id_venta, fecha_hora, total_pagado, monto_recibido, vuelto, tipo_pago, estado')
    .eq('id_venta', idVenta)
    .maybeSingle();

  if (errV) throw new Error(`Error al obtener venta: ${errV.message}`);
  if (!venta) return null;

  const { data: lineas, error: errL } = await supabase
    .from('detalle_ventas')
    .select('id_detalle, codigo_barras, cantidad, precio_unitario')
    .eq('id_venta', idVenta);

  if (errL) throw new Error(`Error al obtener detalle: ${errL.message}`);

  // Obtener nombres de productos
  const codigos = [...new Set((lineas ?? []).map((l) => l.codigo_barras))];
  const { data: productos } = await supabase
    .from('productos')
    .select('codigo_barras, nombre')
    .in('codigo_barras', codigos);

  const mapaNombres: Record<string, string> = {};
  for (const p of productos ?? []) {
    mapaNombres[p.codigo_barras] = p.nombre;
  }

  return {
    venta: venta as VentaResumen,
    lineas: (lineas ?? []).map((l) => ({
      id_detalle: l.id_detalle,
      codigo_barras: l.codigo_barras,
      nombre: mapaNombres[l.codigo_barras] ?? l.codigo_barras,
      cantidad: l.cantidad,
      precio_unitario: l.precio_unitario,
    })),
  };
}

export async function anularVenta(idVenta: number): Promise<Venta> {
  const supabase = obtenerClienteSupabase();
  // `_sesion`: anular es operación de administrador cuando hay token.
  const { data, error } = await supabase.rpc('anular_venta_sesion', { p_id_venta: idVenta });

  if (error) {
    throw new Error(`Error al anular venta: ${error.message}`);
  }

  return data as Venta;
}
