import { obtenerClienteSupabase } from './baseService';
import type { ClienteFiado } from '../../shared/types/ventas';

export async function listarClientes(): Promise<ClienteFiado[]> {
  const supabase = obtenerClienteSupabase();
  const { data, error } = await supabase
    .from('clientes')
    .select('*')
    .eq('activo', true)
    .order('nombre', { ascending: true });
  if (error) throw new Error(`Error al listar clientes: ${error.message}`);
  return (data ?? []) as ClienteFiado[];
}

export async function crearCliente(datos: {
  nombre: string;
  ruc?: string;
  telefono?: string;
  limite_credito?: number;
}): Promise<ClienteFiado> {
  const supabase = obtenerClienteSupabase();
  const { data, error } = await supabase
    .from('clientes')
    .insert({
      nombre: datos.nombre,
      ruc: datos.ruc || null,
      telefono: datos.telefono || null,
      limite_credito: datos.limite_credito ?? 0,
      saldo_deudor: 0,
    })
    .select()
    .single();
  if (error) throw new Error(`Error al crear cliente: ${error.message}`);
  return data as ClienteFiado;
}

export async function actualizarLimiteCredito(idCliente: number, limite: number): Promise<void> {
  const supabase = obtenerClienteSupabase();
  const { error } = await supabase
    .from('clientes')
    .update({ limite_credito: limite })
    .eq('id_cliente', idCliente);
  if (error) throw new Error(`Error al actualizar límite: ${error.message}`);
}

// Carga la compra a la cuenta corriente. La RPC inserta el movimiento y
// actualiza el saldo en una sola transacción, con la fila del cliente
// bloqueada (migración 20260828000002).
//
// Antes esto eran tres viajes sueltos --insert, select del saldo, update con
// el valor leído--: dos operaciones solapadas sobre el mismo cliente perdían
// una, y si el update fallaba después del insert el cliente quedaba debiendo
// plata que el sistema no contaba.
export async function registrarCompraFiado(
  idCliente: number,
  idVenta: number,
  total: number,
): Promise<void> {
  const supabase = obtenerClienteSupabase();
  const { error } = await supabase.rpc('registrar_compra_fiado', {
    p_id_cliente: idCliente,
    p_id_venta: idVenta,
    p_monto: total,
  });
  if (error) throw new Error(`Error al registrar compra a crédito: ${error.message}`);
}

export async function eliminarCliente(idCliente: number): Promise<void> {
  const supabase = obtenerClienteSupabase();
  const { error } = await supabase
    .from('clientes')
    .update({ activo: false })
    .eq('id_cliente', idCliente);
  if (error) throw new Error(`Error al eliminar cliente: ${error.message}`);
}

// Pago del cliente contra su deuda. Misma transacción que la compra: el
// movimiento y el saldo se mueven juntos o no se mueve ninguno.
export async function registrarAmortizacion(
  idCliente: number,
  monto: number,
): Promise<void> {
  const supabase = obtenerClienteSupabase();
  const { error } = await supabase.rpc('registrar_amortizacion', {
    p_id_cliente: idCliente,
    p_monto: monto,
  });
  if (error) throw new Error(`Error al registrar amortización: ${error.message}`);
}
