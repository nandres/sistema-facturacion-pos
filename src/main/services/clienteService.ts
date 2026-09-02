import { obtenerClienteSupabase } from './baseService';

// Fila completa de public.clientes tal como la devuelve la BD.
export interface Cliente {
  id_cliente: number;
  nombre: string;
  ruc: string | null;
  email: string | null;
  telefono: string | null;
  direccion: string | null;
  activo: boolean;
  creado_en: string;        // ISO 8601 timestamptz
  actualizado_en: string;   // ISO 8601 timestamptz
}

// Payload para crear un cliente: nombre obligatorio, resto opcional.
// id_cliente, creado_en y actualizado_en los completa la BD.
export interface ClienteInput {
  nombre: string;
  ruc?: string | null;
  email?: string | null;
  telefono?: string | null;
  direccion?: string | null;
  activo?: boolean;
}

// Payload para actualizar: todos opcionales (semantica PATCH).
export type ClienteUpdate = Partial<ClienteInput>;

const TABLA = 'clientes';

export async function obtenerClientes(): Promise<Cliente[]> {
  try {
    const supabase = obtenerClienteSupabase();
    const { data, error } = await supabase
      .from(TABLA)
      .select('*')
      .order('id_cliente', { ascending: true });

    if (error) {
      throw new Error(`Error al obtener clientes: ${error.message}`);
    }
    return (data ?? []) as Cliente[];
  } catch (err) {
    console.error('[clienteService.obtenerClientes]', err);
    throw err;
  }
}

export async function crearCliente(input: ClienteInput): Promise<Cliente> {
  try {
    const supabase = obtenerClienteSupabase();
    const { data, error } = await supabase
      .from(TABLA)
      .insert(input)
      .select()
      .single();

    if (error) {
      throw new Error(`Error al crear cliente: ${error.message}`);
    }
    return data as Cliente;
  } catch (err) {
    console.error('[clienteService.crearCliente]', err);
    throw err;
  }
}

export async function actualizarCliente(
  id: number,
  cambios: ClienteUpdate,
): Promise<Cliente> {
  try {
    const supabase = obtenerClienteSupabase();
    const { data, error } = await supabase
      .from(TABLA)
      .update(cambios)
      .eq('id_cliente', id)
      .select()
      .single();

    if (error) {
      throw new Error(`Error al actualizar cliente ${id}: ${error.message}`);
    }
    return data as Cliente;
  } catch (err) {
    console.error(`[clienteService.actualizarCliente:${id}]`, err);
    throw err;
  }
}
