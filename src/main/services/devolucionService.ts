import { obtenerClienteSupabase } from './baseService';

export interface CrearDevolucionInput {
  id_venta: number;
  id_usuario?: number | null;
  motivo?: string;
  lineas: { codigo_barras: string; cantidad: number; precio_unitario: number }[];
}

// Delega en la RPC `crear_devolucion` (migración 20260828000004), que hace
// todo en una transacción: valida las cantidades contra lo vendido y lo ya
// devuelto, repone el stock con la fila bloqueada y anula la venta --por
// `anular_venta`, que también revierte la cuenta corriente-- si no quedó nada
// sin devolver.
//
// Lo que había acá eran cuatro operaciones sueltas sin transacción, con la
// reposición de stock intentando tres estrategias en cascada de las cuales las
// dos primeras no podían funcionar: `incrementar_stock` nunca existió y el
// segundo intento pasaba un objeto de consulta como valor de columna, callado
// con un `as any`. Funcionaba de casualidad, por el tercer intento, que además
// no miraba si había fallado. Y nada validaba cuánto se estaba devolviendo.
export async function crearDevolucion(input: CrearDevolucionInput) {
  const supabase = obtenerClienteSupabase();

  const { data, error } = await supabase.rpc('crear_devolucion', {
    p_devolucion: {
      id_venta: input.id_venta,
      id_usuario: input.id_usuario ?? null,
      motivo: input.motivo ?? null,
      lineas: input.lineas,
    },
  });

  if (error) throw new Error(`Error al registrar la devolución: ${error.message}`);
  if (!data) throw new Error('La RPC crear_devolucion no devolvió datos.');

  return data as { id_devolucion: number; total_devuelto: number; venta_anulada: boolean };
}

export async function listarDevolucionesPorVenta(idVenta: number) {
  const supabase = obtenerClienteSupabase();
  const { data, error } = await supabase
    .from('devoluciones')
    .select('*, detalle_devoluciones(*)')
    .eq('id_venta', idVenta)
    .order('fecha_hora', { ascending: false });
  if (error) throw new Error(`Error al listar devoluciones: ${error.message}`);
  return data ?? [];
}
