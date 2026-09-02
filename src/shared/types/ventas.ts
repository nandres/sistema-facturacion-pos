// Tipos públicos del módulo de ventas, compartidos entre main y renderer.
// Mantener en sync con ventaService.ts y con la migración SQL de
// registrar_venta (CHECK constraints, columnas).

// Catálogo de medios de pago aceptados.
//
// `credito` es la venta fiada. No lo elige el cajero en el selector --para eso
// está `MedioPagoManual`--: lo pone el sistema cuando la venta va a la cuenta
// corriente del cliente. Existe como medio propio porque el arqueo necesita
// distinguirlo: es una venta registrada por la que NO entró plata al cajón.
export type MedioPago = 'efectivo' | 'tarjeta' | 'transferencia' | 'cheque' | 'credito';

/** Los que el cajero puede elegir a mano en el panel de cobro. */
export type MedioPagoManual = Exclude<MedioPago, 'credito'>;

export interface PagoInput {
  medio_pago: MedioPago;
  monto: number;
}

export interface PagoVenta {
  id_pago: number;
  id_venta: number;
  medio_pago: MedioPago;
  monto: number;
}

// Medio de pago de la cabecera. `mixto` cuando hubo más de uno; el desglose
// real vive en `pagos_venta`, que es lo que mira el cierre de caja.
export type TipoPago = MedioPago | 'mixto';

export interface LineaVentaInput {
  codigo_barras: string;
  cantidad: number;         // numeric(10,3) en BD — soporta productos por peso
  precio_unitario: number;  // numeric(12,0) en BD — guaraní entero
}

export interface CabeceraVentaInput {
  total_pagado: number;
  monto_recibido: number;
  tipo_pago: TipoPago;
  pagos: PagoInput[];
  id_usuario?: number | null;
  id_cliente?: number | null;
  /**
   * Identificador propio del cliente, para que un reintento no duplique la
   * venta. Lo llena la cola offline con su `idTemp`; una venta en línea no lo
   * manda, porque no se reintenta. Ver `20260901000001_venta_idempotente.sql`.
   */
  referencia_externa?: string | null;
}

export interface VentaInput {
  cabecera: CabeceraVentaInput;
  lineas: LineaVentaInput[];
}

export interface Venta {
  id_venta: number;
  fecha_hora: string;       // ISO 8601 timestamptz
  total_pagado: number;
  monto_recibido: number;
  vuelto: number;           // columna GENERATED en BD
  tipo_pago: TipoPago;
  id_usuario: number | null;
  id_cliente: number | null;
  /** Solo la traen las ventas que entraron por la cola offline. */
  referencia_externa?: string | null;
}

export interface LineaVenta {
  id_detalle: number;
  id_venta: number;
  codigo_barras: string;
  cantidad: number;
  precio_unitario: number;
}

export interface VentaConLineas {
  venta: Venta;
  lineas: LineaVenta[];
}

export interface LineaTicket {
  nombre: string;
  cantidad: number;
  precio_unitario: number;
}

export interface DatosTicket {
  id_venta: number;
  fecha_hora: string;
  total_pagado: number;
  monto_recibido: number;
  vuelto: number;
  tipo_pago: string;
  lineas: LineaTicket[];
  ivaPorTasa?: Record<number, number>;
}

// Ticket Z (cierre de caja). No comparte forma con DatosTicket: no tiene
// lineas de articulo ni vuelto, y en cambio lleva el desglose por medio de
// pago, los movimientos del turno y el resultado del arqueo.
export interface DatosTicketZ {
  id_arqueo: number;
  cajero?: string;
  fecha_apertura: string;
  fecha_cierre: string | null;
  fondo_inicial: number;
  total_efectivo: number;
  total_tarjeta: number;
  total_transferencia: number;
  total_mixto: number;
  total_ventas: number;
  entradas: number;
  retiros: number;
  esperado: number;
  declarado: number;
  diferencia: number;
}

export interface VentaResumen {
  id_venta: number;
  fecha_hora: string;
  total_pagado: number;
  monto_recibido: number;
  vuelto: number;
  tipo_pago: string;
  estado: string;
  /**
   * Cuánto de esta venta entró en efectivo, del desglose real de `pagos_venta`.
   *
   * Existe porque `tipo_pago` no alcanza para saberlo: una venta `mixto` puede
   * tener parte en efectivo, y una `credito` no tiene nada. La pantalla de
   * arqueo suma esto para mostrar el mismo esperado que después calcula
   * `cerrar_caja`.
   */
  efectivo: number;
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

export interface ProductoAlertaStock {
  codigo_barras: string;
  nombre: string;
  stock: number;
  precio_venta: number;
}

export interface VentaPendiente {
  idTemp: string;
  payload: VentaInput;
  fecha: string;
  intentos: number;
}

/**
 * Una pendiente que agotó los reintentos, con el motivo del último fallo.
 *
 * No se borra nunca: es una venta que el comercio ya cobró y cuya mercadería
 * ya salió del local. Sale de la cola de sincronización y queda acá para poder
 * cargarla a mano.
 */
export interface VentaFallida extends VentaPendiente {
  ultimoError: string;
  descartadaEn: string;
}

export interface EstadoOffline {
  conectado: boolean;
  pendientes: number;
  /** Las que agotaron reintentos y hay que cargar a mano. */
  fallidas: number;
}

export interface ResultadoSincronizacion {
  sincronizadas: number;
  fallaron: number;
}

export interface MovimientoCaja {
  id_movimiento: number;
  id_arqueo: number;
  tipo: 'entrada' | 'retirada';
  monto: number;
  concepto: string;
  fecha: string;
}

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

export interface UsuarioSesion {
  id_usuario: number;
  nombre_empleado: string;
  rol: string;
}

export interface Envase {
  id_envase: number;
  nombre: string;
  precio: number;
}

export type DatosProducto = import('./productos').Producto;

export interface CarritoGuardado {
  carrito: Array<{
    codigo_barras: string;
    nombre: string;
    precio_unitario: number;
    cantidad: number;
    stock_disponible: number;
    iva: number;
  }>;
  montoRecibido: number;
  pagos: PagoInput[];
  timestamp: number;
}

export interface Proveedor {
  id_proveedor: number;
  ruc: string | null;
  razon_social: string;
  telefono: string | null;
  contacto: string | null;
  activo: boolean;
}

export interface CompraDB {
  id_compra: number;
  id_proveedor: number | null;
  fecha_hora: string;
  total: number;
  factura_numero: string | null;
}

export interface TopProducto {
  codigo_barras: string;
  nombre: string;
  cantidad_total: number;
  monto_total: number;
}

export interface VentaPorHora {
  hora: number;
  cantidad: number;
  monto: number;
}

export interface ClienteFiado {
  id_cliente: number;
  nombre: string;
  ruc: string | null;
  telefono: string | null;
  direccion: string | null;
  limite_credito: number;
  saldo_deudor: number;
  activo: boolean;
}
