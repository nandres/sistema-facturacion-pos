// Tipo público compartido entre main y renderer. Espejo de
// public.productos en la BD (ver supabase/migrations/...).
// Mantener en sync con productoService.ts.
export interface Producto {
  codigo_barras: string;
  nombre: string;
  precio_venta: number;     // numeric(12,0) — guaraní entero
  precio_costo: number;     // numeric(12,0) — guaraní entero
  stock: number;            // numeric(10,3) — decimales para productos por peso
  iva: number;              // numeric(5,2) — porcentaje (0/5.00/10.00)
  id_categoria?: number | null;
  creado_en?: string;        // ISO 8601 timestamptz
  actualizado_en?: string;   // ISO 8601 timestamptz
}

// Entrada para crear un producto. Vive aca, no en el servicio, porque el
// renderer arma este objeto y el main lo consume: una sola definicion evita
// que los dos lados se desincronicen (paso justo con id_categoria).
export interface CrearProductoInput {
  codigo_barras: string;
  nombre: string;
  precio_venta: number;
  precio_costo: number;
  stock: number;
  iva: number;
  id_categoria?: number | null;
}

// Edicion parcial: solo los campos que el editor de productos permite tocar.
export type ActualizarProductoInput = Partial<
  Pick<Producto, 'nombre' | 'precio_venta' | 'precio_costo' | 'stock' | 'iva' | 'id_categoria'>
>;

/**
 * Una linea de la lista de compras: producto por debajo del minimo.
 *
 * Vive aca porque cruza IPC --el main la arma, el renderer la muestra y se la
 * devuelve al main para imprimirla-- y estaba tipada como `any[]` en las tres
 * puntas.
 */
export interface ProductoFaltante {
  codigo_barras: string;
  nombre: string;
  stock: number;
  stock_minimo: number;
  cantidad_necesaria: number;
}

/**
 * Una devolucion con su detalle anidado, como la devuelve
 * `devoluciones.listar`.
 *
 * Los campos van opcionales a proposito: la fila viene de un `select` con
 * relacion anidada y el historial la lee a la defensiva.
 */
export interface DevolucionConDetalle {
  id_devolucion?: number;
  id_venta?: number;
  fecha_hora?: string;
  motivo?: string | null;
  total_devuelto?: number;
  detalle_devoluciones?: { codigo_barras?: string; cantidad?: number }[];
}

export interface Categoria {
  id_categoria: number;
  nombre: string;
  color: string;
}
