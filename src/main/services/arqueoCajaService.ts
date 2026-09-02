import { obtenerClienteSupabase } from './baseService';

export interface Arqueo {
  id_arqueo: number;
  fecha_apertura: string;
  fondo_inicial: number;
  fecha_cierre: string | null;
  fondo_declarado: number | null;
  total_efectivo: number;
  total_tarjeta: number;
  total_transferencia: number;
  total_mixto: number;
  total_ventas: number;
  esperado_efectivo: number | null;
  diferencia: number | null;
  estado: 'abierta' | 'cerrada';
}

export async function abrirCaja(fondoInicial: number, idUsuario?: number): Promise<Arqueo> {
  const supabase = obtenerClienteSupabase();
  const { data, error } = await supabase.rpc('abrir_caja', {
    p_fondo_inicial: Math.round(fondoInicial),
    p_id_usuario: idUsuario ?? null,
  });
  if (error) throw new Error(`Error al abrir caja: ${error.message}`);
  return data as Arqueo;
}

export async function cerrarCaja(idArqueo: number, fondoDeclarado: number, idUsuario?: number): Promise<Arqueo> {
  const supabase = obtenerClienteSupabase();
  const { data, error } = await supabase.rpc('cerrar_caja', {
    p_id_arqueo: idArqueo,
    p_fondo_declarado: Math.round(fondoDeclarado),
    p_id_usuario: idUsuario ?? null,
  });
  if (error) throw new Error(`Error al cerrar caja: ${error.message}`);
  return data as Arqueo;
}

export async function obtenerArqueoAbierto(idUsuario?: number): Promise<Arqueo | null> {
  const supabase = obtenerClienteSupabase();
  const { data, error } = await supabase.rpc('obtener_arqueo_abierto', {
    p_id_usuario: idUsuario ?? null,
  });
  if (error) throw new Error(`Error al consultar arqueo: ${error.message}`);
  return data as Arqueo | null;
}

export async function listarArqueos(limite = 50): Promise<Arqueo[]> {
  const supabase = obtenerClienteSupabase();
  const { data, error } = await supabase
    .from('arqueos_caja')
    .select('*')
    .order('fecha_apertura', { ascending: false })
    .limit(limite);
  if (error) throw new Error(`Error al listar arqueos: ${error.message}`);
  return (data ?? []) as Arqueo[];
}
