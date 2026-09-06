import { contextBridge, ipcRenderer } from 'electron';
import type { ApiPOS, Resultado } from '../shared/types/api';
import type { Producto, ProductoFaltante, DevolucionConDetalle } from '../shared/types/productos';
import type { Venta, VentaInput, VentaConLineas, DatosTicket, DatosTicketZ, VentaResumen, VentaDetalle, Arqueo, ProductoAlertaStock, VentaPendiente, VentaFallida, EstadoOffline, ResultadoSincronizacion, MovimientoCaja, Cuenta, LineaGanancia, ResumenEnvase, UsuarioSesion, CarritoGuardado, Envase, Proveedor, CompraDB, TopProducto, VentaPorHora, ClienteFiado } from '../shared/types/ventas';
import type { Comercio } from '../shared/config/comercio';
import type { Conexion, EstadoConexion } from '../shared/config/conexion';
import { CANALES } from '../shared/ipc/canales';

const api: ApiPOS = {
  usuarios: {
    cerrarSesion: () =>
      ipcRenderer.invoke(CANALES.usuariosCerrarSesion) as Promise<Resultado<null>>,
    autenticar: (nombre: string, password: string) =>
      ipcRenderer.invoke(CANALES.usuariosAutenticar, nombre, password) as Promise<Resultado<UsuarioSesion | null>>,
  },
  productos: {
    obtener: (codigoBarras: string) =>
      ipcRenderer.invoke(CANALES.productosObtener, codigoBarras) as Promise<Resultado<Producto>>,
    buscar: (query: string) =>
      ipcRenderer.invoke(CANALES.productosBuscar, query) as Promise<Resultado<Producto[]>>,
    generarCodigo: (seed?: number) =>
      ipcRenderer.invoke(CANALES.productosGenerarCodigo, seed) as Promise<Resultado<string>>,
    imprimirEtiqueta: (datos: { codigo: string; nombre: string; precio: number }) =>
      ipcRenderer.invoke(CANALES.productosImprimirEtiqueta, datos) as Promise<Resultado<null>>,
    actualizarCodigo: (codigoActual: string, nuevoCodigo: string) =>
      ipcRenderer.invoke(CANALES.productosActualizarCodigo, codigoActual, nuevoCodigo) as Promise<Resultado<null>>,
    listar: (termino?: string) =>
      ipcRenderer.invoke(CANALES.productosListar, termino) as Promise<Resultado<Producto[]>>,
    actualizar: (codigoBarras: string, cambios: Record<string, unknown>) =>
      ipcRenderer.invoke(CANALES.productosActualizar, codigoBarras, cambios) as Promise<Resultado<null>>,
    crear: (input: { codigo_barras: string; nombre: string; precio_venta: number; precio_costo: number; stock: number; iva: number }) =>
      ipcRenderer.invoke(CANALES.productosCrear, input) as Promise<Resultado<Producto>>,
    eliminar: (codigoBarras: string) =>
      ipcRenderer.invoke(CANALES.productosEliminar, codigoBarras) as Promise<Resultado<null>>,
  },
  ventas: {
    registrar: (input: VentaInput) =>
      ipcRenderer.invoke(CANALES.ventasRegistrar, input) as Promise<Resultado<VentaConLineas>>,
    listar: (desde?: string, hasta?: string, idUsuario?: number) =>
      ipcRenderer.invoke(CANALES.ventasListar, desde, hasta, idUsuario) as Promise<Resultado<VentaResumen[]>>,
    detalle: (idVenta: number) =>
      ipcRenderer.invoke(CANALES.ventasDetalle, idVenta) as Promise<Resultado<VentaDetalle | null>>,
    anular: (idVenta: number) =>
      ipcRenderer.invoke(CANALES.ventasAnular, idVenta) as Promise<Resultado<Venta>>,
  },
  ticket: {
    imprimir: (datos: DatosTicket) =>
      ipcRenderer.invoke(CANALES.ticketImprimir, datos) as Promise<Resultado<null>>,
    notaCredito: (datos: DatosTicket) =>
      ipcRenderer.invoke(CANALES.ticketNotaCredito, datos) as Promise<Resultado<null>>,
    arqueoZ: (datos: DatosTicketZ) =>
      ipcRenderer.invoke(CANALES.ticketArqueoZ, datos) as Promise<Resultado<null>>,
  },
  caja: {
    abrir: (fondoInicial: number, idUsuario?: number) =>
      ipcRenderer.invoke(CANALES.cajaAbrir, fondoInicial, idUsuario) as Promise<Resultado<Arqueo>>,
    cerrar: (idArqueo: number, fondoDeclarado: number, idUsuario?: number) =>
      ipcRenderer.invoke(CANALES.cajaCerrar, idArqueo, fondoDeclarado, idUsuario) as Promise<Resultado<Arqueo>>,
    arqueoAbierto: (idUsuario?: number) =>
      ipcRenderer.invoke(CANALES.cajaArqueoAbierto, idUsuario) as Promise<Resultado<Arqueo | null>>,
    listarArqueos: () =>
      ipcRenderer.invoke(CANALES.cajaListarArqueos) as Promise<Resultado<Arqueo[]>>,
    registrarMovimiento: (idArqueo: number, tipo: 'entrada' | 'retirada', monto: number, concepto?: string) =>
      ipcRenderer.invoke(CANALES.cajaRegistrarMovimiento, idArqueo, tipo, monto, concepto) as Promise<Resultado<MovimientoCaja>>,
    listarMovimientos: (idArqueo: number) =>
      ipcRenderer.invoke(CANALES.cajaListarMovimientos, idArqueo) as Promise<Resultado<MovimientoCaja[]>>,
  },
  stock: {
    critico: () =>
      ipcRenderer.invoke(CANALES.stockCritico) as Promise<Resultado<ProductoAlertaStock[]>>,
    listaCompras: (stockMinimo?: number) =>
      ipcRenderer.invoke(CANALES.stockListaCompras, stockMinimo) as Promise<Resultado<{ productos: ProductoFaltante[]; total: number }>>,
    imprimirLista: (productos: ProductoFaltante[]) =>
      ipcRenderer.invoke(CANALES.stockImprimirLista, productos) as Promise<Resultado<boolean>>,
  },
  cuentas: {
    listar: (tabla: 'pagar' | 'recibir') =>
      ipcRenderer.invoke(CANALES.cuentasListar, tabla) as Promise<Resultado<Cuenta[]>>,
    crear: (tabla: 'pagar' | 'recibir', datos: Partial<Cuenta>) =>
      ipcRenderer.invoke(CANALES.cuentasCrear, tabla, datos) as Promise<Resultado<Cuenta>>,
    actualizarEstado: (tabla: 'pagar' | 'recibir', id: number, estado: string, saldo?: number) =>
      ipcRenderer.invoke(CANALES.cuentasActualizarEstado, tabla, id, estado, saldo) as Promise<Resultado<Cuenta>>,
  },
  informes: {
    ganancias: (desde?: string, hasta?: string, idUsuario?: number) =>
      ipcRenderer.invoke(CANALES.informesGanancias, desde, hasta, idUsuario) as Promise<Resultado<LineaGanancia[]>>,
    gananciaTotal: (desde?: string, hasta?: string, idUsuario?: number) =>
      ipcRenderer.invoke(CANALES.informesGananciaTotal, desde, hasta, idUsuario) as Promise<Resultado<number>>,
    envases: (desde?: string, hasta?: string, idUsuario?: number) =>
      ipcRenderer.invoke(CANALES.informesEnvases, desde, hasta, idUsuario) as Promise<Resultado<ResumenEnvase[]>>,
    topProductos: (desde?: string, hasta?: string, idUsuario?: number) =>
      ipcRenderer.invoke(CANALES.informesTopProductos, desde, hasta, idUsuario) as Promise<Resultado<TopProducto[]>>,
    ventasPorHora: (desde?: string, hasta?: string, idUsuario?: number) =>
      ipcRenderer.invoke(CANALES.informesVentasPorHora, desde, hasta, idUsuario) as Promise<Resultado<VentaPorHora[]>>,
    gananciaTotalNeta: (desde?: string, hasta?: string, idUsuario?: number) =>
      ipcRenderer.invoke(CANALES.informesGananciaTotalNeta, desde, hasta, idUsuario) as Promise<Resultado<number>>,
  },
  archivo: {
    exportarVentas: (desde?: string, hasta?: string, idUsuario?: number) =>
      ipcRenderer.invoke(CANALES.archivoExportarVentas, desde, hasta, idUsuario) as Promise<Resultado<{ guardado: boolean; ventas: number }>>,
    guardarCsv: (contenido: string, nombreDefecto: string) =>
      ipcRenderer.invoke(CANALES.archivoGuardarCsv, contenido, nombreDefecto) as Promise<Resultado<boolean>>,
    guardarExcel: (base64: string, nombreDefecto: string) =>
      ipcRenderer.invoke(CANALES.archivoGuardarExcel, base64, nombreDefecto) as Promise<Resultado<boolean>>,
  },
  carrito: {
    guardar: (data: CarritoGuardado) =>
      ipcRenderer.invoke(CANALES.carritoGuardar, data) as Promise<Resultado<null>>,
    recuperar: () =>
      ipcRenderer.invoke(CANALES.carritoRecuperar) as Promise<Resultado<CarritoGuardado | null>>,
  },
  envases: {
    listar: () =>
      ipcRenderer.invoke(CANALES.envasesListar) as Promise<Resultado<Envase[]>>,
  },
  offline: {
    verificarConexion: () =>
      ipcRenderer.invoke(CANALES.offlineVerificarConexion) as Promise<Resultado<boolean>>,
    estado: () =>
      ipcRenderer.invoke(CANALES.offlineEstado) as Promise<Resultado<EstadoOffline>>,
    guardarVenta: (input: VentaInput) =>
      ipcRenderer.invoke(CANALES.offlineGuardarVenta, input) as Promise<Resultado<null>>,
    ventasPendientes: () =>
      ipcRenderer.invoke(CANALES.offlineVentasPendientes) as Promise<Resultado<VentaPendiente[]>>,
    ventasFallidas: () =>
      ipcRenderer.invoke(CANALES.offlineVentasFallidas) as Promise<Resultado<VentaFallida[]>>,
    olvidarFallida: (idTemp: string) =>
      ipcRenderer.invoke(CANALES.offlineOlvidarFallida, idTemp) as Promise<Resultado<null>>,
    sincronizar: () =>
      ipcRenderer.invoke(CANALES.offlineSincronizar) as Promise<Resultado<ResultadoSincronizacion>>,
  },
  proveedores: {
    listar: () =>
      ipcRenderer.invoke(CANALES.proveedoresListar) as Promise<Resultado<Proveedor[]>>,
    crear: (datos: { ruc?: string; razon_social: string; telefono?: string; contacto?: string }) =>
      ipcRenderer.invoke(CANALES.proveedoresCrear, datos) as Promise<Resultado<Proveedor>>,
  },
  compras: {
    registrar: (datos: { id_proveedor?: number; factura_numero?: string; lineas: { codigo_barras: string; cantidad: number; precio_costo: number }[] }, idUsuario?: number) =>
      ipcRenderer.invoke(CANALES.comprasRegistrar, datos, idUsuario) as Promise<Resultado<CompraDB>>,
    listar: (desde?: string, hasta?: string, idUsuario?: number) =>
      ipcRenderer.invoke(CANALES.comprasListar, desde, hasta, idUsuario) as Promise<Resultado<CompraDB[]>>,
  },
  ventana: {
    minimizar: () =>
      ipcRenderer.invoke(CANALES.ventanaMinimizar) as Promise<Resultado<null>>,
    maximizar: () =>
      ipcRenderer.invoke(CANALES.ventanaMaximizar) as Promise<Resultado<null>>,
    cerrar: () =>
      ipcRenderer.invoke(CANALES.ventanaCerrar) as Promise<Resultado<null>>,
  },
  clientes: {
    listar: () =>
      ipcRenderer.invoke(CANALES.clientesListar) as Promise<Resultado<ClienteFiado[]>>,
    crear: (datos: { nombre: string; ruc?: string; telefono?: string; limite_credito?: number }) =>
      ipcRenderer.invoke(CANALES.clientesCrear, datos) as Promise<Resultado<ClienteFiado>>,
    actualizarLimite: (idCliente: number, limite: number) =>
      ipcRenderer.invoke(CANALES.clientesActualizarLimite, idCliente, limite) as Promise<Resultado<null>>,
    registrarCompraFiado: (idCliente: number, idVenta: number, total: number) =>
      ipcRenderer.invoke(CANALES.clientesRegistrarCompraFiado, idCliente, idVenta, total) as Promise<Resultado<null>>,
    registrarAmortizacion: (idCliente: number, monto: number) =>
      ipcRenderer.invoke(CANALES.clientesRegistrarAmortizacion, idCliente, monto) as Promise<Resultado<null>>,
    eliminar: (idCliente: number) =>
      ipcRenderer.invoke(CANALES.clientesEliminar, idCliente) as Promise<Resultado<null>>,
  },
  actualizar: {
    check: () =>
      ipcRenderer.invoke(CANALES.actualizarCheck) as Promise<Resultado<{ disponible: boolean; version: string; url: string; changelog?: string } | null>>,
    descargarEInstalar: () =>
      ipcRenderer.invoke(CANALES.actualizarDescargar) as Promise<Resultado<boolean>>,
  },
  backup: {
    realizar: () =>
      ipcRenderer.invoke(CANALES.backupRealizar) as Promise<Resultado<string | null>>,
  },
  productosImportarExcel: () =>
    ipcRenderer.invoke(CANALES.productosImportarExcel) as Promise<Resultado<{ insertados: number; total: number }>>,
  categorias: {
    listar: () =>
      ipcRenderer.invoke(CANALES.categoriasListar) as Promise<Resultado<{ id_categoria: number; nombre: string; color: string }[]>>,
    crear: (nombre: string, color?: string) =>
      ipcRenderer.invoke(CANALES.categoriasCrear, nombre, color) as Promise<Resultado<{ id_categoria: number; nombre: string; color: string }>>,
    eliminar: (id: number) =>
      ipcRenderer.invoke(CANALES.categoriasEliminar, id) as Promise<Resultado<null>>,
  },
  devoluciones: {
    crear: (input: { id_venta: number; id_usuario?: number; motivo?: string; lineas: { codigo_barras: string; cantidad: number; precio_unitario: number }[] }) =>
      ipcRenderer.invoke(CANALES.devolucionesCrear, input) as Promise<Resultado<{ id_devolucion: number; total_devuelto: number }>>,
    listar: (idVenta: number) =>
      ipcRenderer.invoke(CANALES.devolucionesListar, idVenta) as Promise<Resultado<DevolucionConDetalle[]>>,
  },
  config: {
    obtenerComercio: () =>
      ipcRenderer.invoke(CANALES.configObtenerComercio) as Promise<Resultado<Comercio>>,
    guardarComercio: (datos: Comercio) =>
      ipcRenderer.invoke(CANALES.configGuardarComercio, datos) as Promise<Resultado<Comercio>>,
    listarImpresoras: () =>
      ipcRenderer.invoke(CANALES.configListarImpresoras) as Promise<Resultado<{ impresoras: string[]; actual: string | null }>>,
    guardarImpresora: (nombre: string) =>
      ipcRenderer.invoke(CANALES.configGuardarImpresora, nombre) as Promise<Resultado<null>>,
    testImpresora: () =>
      ipcRenderer.invoke(CANALES.configTestImpresora) as Promise<Resultado<null>>,
    estadoConexion: () =>
      ipcRenderer.invoke(CANALES.configEstadoConexion) as Promise<Resultado<EstadoConexion>>,
    guardarConexion: (datos: Conexion) =>
      ipcRenderer.invoke(CANALES.configGuardarConexion, datos) as Promise<Resultado<EstadoConexion>>,
  },
};

contextBridge.exposeInMainWorld('api', api);