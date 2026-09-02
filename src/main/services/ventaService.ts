import { obtenerClienteSupabase } from './baseService';
import type {
  TipoPago,
  LineaVentaInput,
  CabeceraVentaInput,
  VentaInput,
  Venta,
  LineaVenta,
  VentaConLineas,
} from '../../shared/types/ventas';

// Re-export para mantener la API existente del servicio. Los tipos
// "viven" en src/shared/types/ventas.ts porque el renderer también
// los consume al armar el payload del carrito.
export type {
  TipoPago,
  LineaVentaInput,
  CabeceraVentaInput,
  VentaInput,
  Venta,
  LineaVenta,
  VentaConLineas,
};

// Mensajes user-friendly por código de error PL/pgSQL. Los códigos vienen
// del USING ERRCODE de la función registrar_venta en la migración.
// El detalle técnico (con valores específicos: cuál producto, cuánto stock)
// queda dentro de VentaError.detalleTecnico para logs/debugging.
const MENSAJES_AMIGABLES: Record<string, string> = {
  P0001: 'Datos de la venta incompletos o inválidos.',
  P0002: 'El total cobrado no coincide con la suma del carrito.',
  P0003: 'Uno de los productos escaneados no existe en el catálogo.',
  P0004: 'Stock insuficiente para completar la venta.',
};

// Error tipado con código + mensaje amigable + detalle técnico.
// Permite al UI hacer: if (err instanceof VentaError && err.codigo === 'P0004')...
export class VentaError extends Error {
  constructor(
    public readonly codigo: string,
    public readonly mensajeUsuario: string,
    public readonly detalleTecnico: string,
    public readonly hint?: string,
  ) {
    super(`${mensajeUsuario} (${codigo}): ${detalleTecnico}`);
    this.name = 'VentaError';
  }
}

export async function registrarVenta(input: VentaInput): Promise<VentaConLineas> {
  try {
    const supabase = obtenerClienteSupabase();
    // `_sesion` en vez de la RPC cruda: cuando el cajero entró por Supabase
    // Auth, la venta se registra a nombre del `id_usuario` de su token y se
    // ignora el del payload. Sin token --service_role-- respeta el payload,
    // que es el comportamiento de siempre.
    //
    // Importa porque el id_usuario decide de qué arqueo cuelga la venta:
    // dejarlo en manos del cliente es dejar que un cajero ensucie la caja de
    // otro.
    const { data, error } = await supabase.rpc('registrar_venta_sesion', { p_venta: input });

    if (error) {
      const codigo = error.code ?? 'UNKNOWN';
      const mensajeAmigable =
        MENSAJES_AMIGABLES[codigo] ?? 'Error al registrar la venta.';
      throw new VentaError(
        codigo,
        mensajeAmigable,
        error.message,
        error.hint ?? undefined,
      );
    }

    if (!data) {
      throw new Error('La RPC registrar_venta no devolvió datos.');
    }

    // Los pagos ya vienen insertados: `registrar_venta` los graba dentro de su
    // propia transacción, junto con la cabecera, las líneas y el descuento de
    // stock (migración 20260828000001).
    //
    // Antes se insertaban acá, en una llamada aparte, y si esa llamada fallaba
    // el error solo se escribía en consola: la venta se daba por buena sin
    // desglose de pagos. Desde que el cierre de caja calcula el efectivo desde
    // `pagos_venta`, una fila perdida es plata perdida en el arqueo.
    return data as VentaConLineas;
  } catch (err) {
    console.error('[ventaService.registrarVenta]', err);
    throw err;
  }
}
