import { obtenerClienteSupabase } from './baseService';

export interface MovimientoCaja {
  id_movimiento: number;
  id_arqueo: number;
  tipo: 'entrada' | 'retirada';
  monto: number;
  concepto: string;
  fecha: string;
}

export async function registrarMovimiento(
  idArqueo: number, tipo: 'entrada' | 'retirada', monto: number, concepto = '',
): Promise<MovimientoCaja> {
  const supabase = obtenerClienteSupabase();
  const { data, error } = await supabase.rpc('registrar_movimiento_caja', {
    p_id_arqueo: idArqueo,
    p_tipo: tipo,
    p_monto: Math.round(monto),
    p_concepto: concepto,
  });
  if (error) throw new Error(`Error al registrar movimiento: ${error.message}`);
  return data as MovimientoCaja;
}

export async function listarMovimientos(idArqueo: number): Promise<MovimientoCaja[]> {
  const supabase = obtenerClienteSupabase();
  const { data, error } = await supabase.rpc('listar_movimientos_caja', { p_id_arqueo: idArqueo });
  if (error) throw new Error(`Error al listar movimientos: ${error.message}`);
  return (data ?? []) as MovimientoCaja[];
}
