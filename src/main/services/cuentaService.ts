import { obtenerClienteSupabase } from './baseService';

export interface Cuenta {
  id_cuenta: number;
  proveedor?: string;
  cliente?: string;
  monto: number;
  saldo: number;
  concepto: string;
  fecha_vencimiento: string | null;
  fecha: string;
  estado: string;
}

const TABLA_PAGAR = 'cuentas_pagar';
const TABLA_RECIBIR = 'cuentas_recibir';

export async function listarCuentas(tabla: 'pagar' | 'recibir'): Promise<Cuenta[]> {
  const supabase = obtenerClienteSupabase();
  const t = tabla === 'pagar' ? TABLA_PAGAR : TABLA_RECIBIR;
  const { data, error } = await supabase.from(t).select('*').order('fecha', { ascending: false });
  if (error) throw new Error(`Error al listar cuentas: ${error.message}`);
  return (data ?? []) as Cuenta[];
}

export async function crearCuenta(tabla: 'pagar' | 'recibir', datos: Partial<Cuenta>): Promise<Cuenta> {
  const supabase = obtenerClienteSupabase();
  const t = tabla === 'pagar' ? TABLA_PAGAR : TABLA_RECIBIR;
  const { data, error } = await supabase.from(t).insert(datos).select().single();
  if (error) throw new Error(`Error al crear cuenta: ${error.message}`);
  return data as Cuenta;
}

export async function actualizarEstadoCuenta(tabla: 'pagar' | 'recibir', id: number, estado: string, saldo?: number): Promise<Cuenta> {
  const supabase = obtenerClienteSupabase();
  const t = tabla === 'pagar' ? TABLA_PAGAR : TABLA_RECIBIR;
  const update: Record<string, unknown> = { estado };
  if (saldo !== undefined) update.saldo = saldo;
  const { data, error } = await supabase.from(t).update(update).eq('id_cuenta', id).select().single();
  if (error) throw new Error(`Error al actualizar cuenta: ${error.message}`);
  return data as Cuenta;
}
