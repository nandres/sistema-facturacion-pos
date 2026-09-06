// Contrato del puente IPC expuesto por el preload (window.api).
// Es la única superficie que el renderer puede usar para hablar con el
// proceso main. Si agregás un método acá, también va el handler en
// src/main/ipc/index.ts y la implementación en el preload.

import type { Producto, CrearProductoInput, ActualizarProductoInput, ProductoFaltante, DevolucionConDetalle } from './productos';
import type { Comercio } from '../config/comercio';
import type { Conexion, EstadoConexion } from '../config/conexion';
import type { Venta, VentaInput, VentaConLineas, DatosTicket, DatosTicketZ, VentaResumen, VentaDetalle, Arqueo, ProductoAlertaStock, VentaPendiente, VentaFallida, EstadoOffline, ResultadoSincronizacion, MovimientoCaja, Cuenta, LineaGanancia, ResumenEnvase, UsuarioSesion, CarritoGuardado, Envase, Proveedor, CompraDB, TopProducto, VentaPorHora, ClienteFiado } from './ventas';

export type ResultadoOk<T> = { ok: true; data: T };
export type ResultadoError = {
  ok: false;
  codigo: string;
  mensaje: string;
  detalle?: string;
};
export type Resultado<T> = ResultadoOk<T> | ResultadoError;

export interface ApiPOS {
  usuarios: {
    /** Cierra la sesión de Supabase Auth. Sin esto, el cajero siguiente
     *  operaría con el token del anterior. */
    cerrarSesion(): Promise<Resultado<null>>;
    autenticar(nombre: string, password: string): Promise<Resultado<UsuarioSesion | null>>;
  };
  productos: {
    obtener(codigoBarras: string): Promise<Resultado<Producto>>;
    buscar(query: string): Promise<Resultado<Producto[]>>;
    generarCodigo(seed?: number): Promise<Resultado<string>>;
    imprimirEtiqueta(datos: { codigo: string; nombre: string; precio: number }): Promise<Resultado<null>>;
    actualizarCodigo(codigoActual: string, nuevoCodigo: string): Promise<Resultado<null>>;
    listar(termino?: string): Promise<Resultado<Producto[]>>;
    actualizar(codigoBarras: string, cambios: ActualizarProductoInput): Promise<Resultado<null>>;
    crear(input: CrearProductoInput): Promise<Resultado<Producto>>;
    eliminar(codigoBarras: string): Promise<Resultado<null>>;
  };
  ventas: {
    registrar(input: VentaInput): Promise<Resultado<VentaConLineas>>;
    listar(desde?: string, hasta?: string, idUsuario?: number): Promise<Resultado<VentaResumen[]>>;
    detalle(idVenta: number): Promise<Resultado<VentaDetalle | null>>;
    anular(idVenta: number): Promise<Resultado<Venta>>;
  };
  ticket: {
    imprimir(datos: DatosTicket): Promise<Resultado<null>>;
    notaCredito(datos: DatosTicket): Promise<Resultado<null>>;
    arqueoZ(datos: DatosTicketZ): Promise<Resultado<null>>;
  };
  caja: {
    abrir(fondoInicial: number, idUsuario?: number): Promise<Resultado<Arqueo>>;
    cerrar(idArqueo: number, fondoDeclarado: number, idUsuario?: number): Promise<Resultado<Arqueo>>;
    arqueoAbierto(idUsuario?: number): Promise<Resultado<Arqueo | null>>;
    listarArqueos(): Promise<Resultado<Arqueo[]>>;
    registrarMovimiento(idArqueo: number, tipo: 'entrada' | 'retirada', monto: number, concepto?: string): Promise<Resultado<MovimientoCaja>>;
    listarMovimientos(idArqueo: number): Promise<Resultado<MovimientoCaja[]>>;
  };
  stock: {
    critico(): Promise<Resultado<ProductoAlertaStock[]>>;
    listaCompras(stockMinimo?: number): Promise<Resultado<{ productos: ProductoFaltante[]; total: number }>>;
    imprimirLista(productos: ProductoFaltante[]): Promise<Resultado<boolean>>;
  };
  cuentas: {
    listar(tabla: 'pagar' | 'recibir'): Promise<Resultado<Cuenta[]>>;
    crear(tabla: 'pagar' | 'recibir', datos: Partial<Cuenta>): Promise<Resultado<Cuenta>>;
    actualizarEstado(tabla: 'pagar' | 'recibir', id: number, estado: string, saldo?: number): Promise<Resultado<Cuenta>>;
  };
  informes: {
    ganancias(desde?: string, hasta?: string, idUsuario?: number): Promise<Resultado<LineaGanancia[]>>;
    gananciaTotal(desde?: string, hasta?: string, idUsuario?: number): Promise<Resultado<number>>;
    envases(desde?: string, hasta?: string, idUsuario?: number): Promise<Resultado<ResumenEnvase[]>>;
    topProductos(desde?: string, hasta?: string, idUsuario?: number): Promise<Resultado<TopProducto[]>>;
    ventasPorHora(desde?: string, hasta?: string, idUsuario?: number): Promise<Resultado<VentaPorHora[]>>;
    gananciaTotalNeta(desde?: string, hasta?: string, idUsuario?: number): Promise<Resultado<number>>;
  };
  archivo: {
    // El libro lo arma el main con exceljs y abre el diálogo de guardado.
    // `guardado` es false si el usuario canceló o si no había ventas.
    exportarVentas(desde?: string, hasta?: string, idUsuario?: number): Promise<Resultado<{ guardado: boolean; ventas: number }>>;
    guardarCsv(contenido: string, nombreDefecto: string): Promise<Resultado<boolean>>;
    guardarExcel(base64: string, nombreDefecto: string): Promise<Resultado<boolean>>;
  };
  carrito: {
    guardar(data: CarritoGuardado): Promise<Resultado<null>>;
    recuperar(): Promise<Resultado<CarritoGuardado | null>>;
  };
  envases: {
    listar(): Promise<Resultado<Envase[]>>;
  };
  offline: {
    verificarConexion(): Promise<Resultado<boolean>>;
    estado(): Promise<Resultado<EstadoOffline>>;
    guardarVenta(input: VentaInput): Promise<Resultado<null>>;
    ventasPendientes(): Promise<Resultado<VentaPendiente[]>>;
    ventasFallidas(): Promise<Resultado<VentaFallida[]>>;
    olvidarFallida(idTemp: string): Promise<Resultado<null>>;
    sincronizar(): Promise<Resultado<ResultadoSincronizacion>>;
  };
  proveedores: {
    listar(): Promise<Resultado<Proveedor[]>>;
    crear(datos: { ruc?: string; razon_social: string; telefono?: string; contacto?: string }): Promise<Resultado<Proveedor>>;
  };
  compras: {
    registrar(datos: { id_proveedor?: number; factura_numero?: string; lineas: { codigo_barras: string; cantidad: number; precio_costo: number }[] }, idUsuario?: number): Promise<Resultado<CompraDB>>;
    listar(desde?: string, hasta?: string, idUsuario?: number): Promise<Resultado<CompraDB[]>>;
  };
  clientes: {
    listar(): Promise<Resultado<ClienteFiado[]>>;
    crear(datos: { nombre: string; ruc?: string; telefono?: string; limite_credito?: number }): Promise<Resultado<ClienteFiado>>;
    actualizarLimite(idCliente: number, limite: number): Promise<Resultado<null>>;
    registrarCompraFiado(idCliente: number, idVenta: number, total: number): Promise<Resultado<null>>;
    registrarAmortizacion(idCliente: number, monto: number): Promise<Resultado<null>>;
    eliminar(idCliente: number): Promise<Resultado<null>>;
  };
  ventana: {
    minimizar(): Promise<Resultado<null>>;
    maximizar(): Promise<Resultado<null>>;
    cerrar(): Promise<Resultado<null>>;
  };
  actualizar: {
    check(): Promise<Resultado<{ disponible: boolean; version: string; url: string; changelog?: string } | null>>;
    // Sin parámetros a propósito: la URL del instalador la resuelve el main
    // releyendo el feed firmado. Si la eligiera el renderer, cualquier cosa
    // que hable con el IPC podría hacer ejecutar un binario arbitrario.
    descargarEInstalar(): Promise<Resultado<boolean>>;
  };
  backup: {
    realizar(): Promise<Resultado<string | null>>;
  };
  productosImportarExcel(): Promise<Resultado<{ insertados: number; total: number }>>;
  categorias: {
    listar(): Promise<Resultado<{ id_categoria: number; nombre: string; color: string }[]>>;
    crear(nombre: string, color?: string): Promise<Resultado<{ id_categoria: number; nombre: string; color: string }>>;
    eliminar(id: number): Promise<Resultado<null>>;
  };
  devoluciones: {
    crear(input: { id_venta: number; id_usuario?: number; motivo?: string; lineas: { codigo_barras: string; cantidad: number; precio_unitario: number }[] }): Promise<Resultado<{ id_devolucion: number; total_devuelto: number }>>;
    listar(idVenta: number): Promise<Resultado<DevolucionConDetalle[]>>;
  };
  config: {
    obtenerComercio(): Promise<Resultado<Comercio>>;
    guardarComercio(datos: Comercio): Promise<Resultado<Comercio>>;
    listarImpresoras(): Promise<Resultado<{ impresoras: string[]; actual: string | null }>>;
    guardarImpresora(nombre: string): Promise<Resultado<null>>;
    testImpresora(): Promise<Resultado<null>>;
    estadoConexion(): Promise<Resultado<EstadoConexion>>;
    guardarConexion(datos: Conexion): Promise<Resultado<EstadoConexion>>;
  };
}

declare global {
  interface Window {
    api: ApiPOS;
  }
}

export {};
