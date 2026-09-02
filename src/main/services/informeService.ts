import { obtenerClienteSupabase } from './baseService';

export interface LineaGanancia {
  id_venta: number;
  fecha_hora: string;
  codigo_barras: string;
  nombre: string;
  cantidad: number;
  precio_venta: number;
  precio_costo: number;
  ganancia: number;
}

export interface ResumenEnvase {
  id_envase: number;
  nombre: string;
  cantidad_total: number;
  monto_total: number;
}

export async function obtenerGanancias(desde?: string, hasta?: string, idUsuario?: number): Promise<LineaGanancia[]> {
  const supabase = obtenerClienteSupabase();
  let query = supabase
    .from('detalle_ventas')
    .select(`
      id_venta,
      cantidad,
      precio_unitario,
      ventas!inner(fecha_hora, id_usuario),
      productos!inner(nombre, precio_costo)
    `)
    .gte('ventas.fecha_hora', desde ?? '1970-01-01')
    .lte('ventas.fecha_hora', hasta ?? '2099-12-31');

  if (idUsuario) query = query.eq('ventas.id_usuario', idUsuario);
  query = query.order('id_venta', { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(`Error al obtener ganancias: ${error.message}`);

  return ((data ?? []) as Record<string, unknown>[]).map((r) => {
    const venta = r.ventas as { fecha_hora: string };
    const prod = r.productos as { nombre: string; precio_costo: number };
    return {
      id_venta: r.id_venta as number,
      fecha_hora: venta.fecha_hora,
      codigo_barras: r.codigo_barras as string,
      nombre: prod.nombre,
      cantidad: r.cantidad as number,
      precio_venta: r.precio_unitario as number,
      precio_costo: prod.precio_costo,
      ganancia: (r.precio_unitario as number) - prod.precio_costo,
    } as LineaGanancia;
  });
}

export async function obtenerGananciaTotal(desde?: string, hasta?: string, idUsuario?: number): Promise<number> {
  const lineas = await obtenerGanancias(desde, hasta, idUsuario);
  return lineas.reduce((acc, l) => acc + l.ganancia * l.cantidad, 0);
}

export async function obtenerReporteEnvases(desde?: string, hasta?: string, idUsuario?: number): Promise<ResumenEnvase[]> {
  const supabase = obtenerClienteSupabase();
  let query = supabase
    .from('detalle_envases_venta')
    .select(`
      id_envase,
      cantidad,
      precio_unitario,
      ventas!inner(fecha_hora, id_usuario)
    `)
    .gte('ventas.fecha_hora', desde ?? '1970-01-01')
    .lte('ventas.fecha_hora', hasta ?? '2099-12-31');

  if (idUsuario) query = query.eq('ventas.id_usuario', idUsuario);

  const { data, error } = await query;
  if (error) throw new Error(`Error al obtener envases: ${error.message}`);

  const agrupado: Record<number, { nombre: string; cant: number; monto: number }> = {};
  for (const r of (data ?? []) as { id_envase: number; cantidad: number; precio_unitario: number }[]) {
    if (!agrupado[r.id_envase]) {
      agrupado[r.id_envase] = { nombre: `Envase #${r.id_envase}`, cant: 0, monto: 0 };
    }
    agrupado[r.id_envase].cant += r.cantidad;
    agrupado[r.id_envase].monto += r.cantidad * r.precio_unitario;
  }

  return Object.entries(agrupado).map(([id, v]) => ({
    id_envase: Number(id),
    nombre: v.nombre,
    cantidad_total: v.cant,
    monto_total: v.monto,
  }));
}

export async function listarVentasPorPeriodo(desde?: string, hasta?: string, idUsuario?: number) {
  const supabase = obtenerClienteSupabase();
  let query = supabase
    .from('ventas')
    .select('*')
    .gte('fecha_hora', desde ?? '1970-01-01')
    .lte('fecha_hora', hasta ?? '2099-12-31')
    .order('fecha_hora', { ascending: false });

  if (idUsuario) query = query.eq('id_usuario', idUsuario);

  const { data, error } = await query;
  if (error) throw new Error(`Error al listar ventas: ${error.message}`);
  return data ?? [];
}

export interface TopProducto {
  codigo_barras: string;
  nombre: string;
  cantidad_total: number;
  monto_total: number;
}

export async function obtenerTopProductos(desde?: string, hasta?: string, idUsuario?: number, limite = 5): Promise<TopProducto[]> {
  const supabase = obtenerClienteSupabase();
  let query = supabase
    .from('detalle_ventas')
    .select(`
      codigo_barras,
      cantidad,
      precio_unitario,
      ventas!inner(fecha_hora, id_usuario),
      productos!inner(nombre)
    `)
    .gte('ventas.fecha_hora', desde ?? '1970-01-01')
    .lte('ventas.fecha_hora', hasta ?? '2099-12-31');

  if (idUsuario) query = query.eq('ventas.id_usuario', idUsuario);

  const { data, error } = await query;
  if (error) throw new Error(`Error al obtener top productos: ${error.message}`);

  const agrupado: Record<string, { nombre: string; cant: number; monto: number }> = {};
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const prod = r.productos as { nombre: string };
    const cod = r.codigo_barras as string;
    if (!agrupado[cod]) agrupado[cod] = { nombre: prod.nombre, cant: 0, monto: 0 };
    agrupado[cod].cant += Number(r.cantidad);
    agrupado[cod].monto += Number(r.cantidad) * Number(r.precio_unitario);
  }

  return Object.entries(agrupado)
    .map(([codigo_barras, v]) => ({ codigo_barras, nombre: v.nombre, cantidad_total: v.cant, monto_total: v.monto }))
    .sort((a, b) => b.cantidad_total - a.cantidad_total)
    .slice(0, limite);
}

export interface VentaPorHora {
  hora: number;
  cantidad: number;
  monto: number;
}

export async function obtenerVentasPorHora(desde?: string, hasta?: string, idUsuario?: number): Promise<VentaPorHora[]> {
  const ventas = await listarVentasPorPeriodo(desde, hasta, idUsuario);
  const agrupado: Record<number, { cantidad: number; monto: number }> = {};
  for (const v of ventas as Record<string, unknown>[]) {
    const hora = new Date(v.fecha_hora as string).getHours();
    if (!agrupado[hora]) agrupado[hora] = { cantidad: 0, monto: 0 };
    agrupado[hora].cantidad += 1;
    agrupado[hora].monto += Number(v.total_pagado as number);
  }
  return Array.from({ length: 24 }, (_, i) => ({
    hora: i,
    cantidad: agrupado[i]?.cantidad ?? 0,
    monto: agrupado[i]?.monto ?? 0,
  }));
}

export async function obtenerGananciaTotalNeta(desde?: string, hasta?: string, idUsuario?: number): Promise<number> {
  const lineas = await obtenerGanancias(desde, hasta, idUsuario);
  return lineas.reduce((acc, l) => acc + l.ganancia * l.cantidad, 0);
}
