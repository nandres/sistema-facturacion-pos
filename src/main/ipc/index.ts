import { ipcMain, dialog, BrowserWindow } from 'electron';
import { writeFile } from 'node:fs/promises';
import { obtenerProducto, buscarProductos, actualizarCodigoBarras, listarProductos, actualizarProducto, crearProducto, eliminarProducto, type CrearProductoInput } from '../services/productoService';
import { registrarVenta, VentaError, type VentaInput } from '../services/ventaService';
import { imprimirTicket, imprimirNotaCredito, imprimirTicketZ, generarCodigoEAN13, imprimirEtiquetaCodigo, testImpresora } from '../services/ticketeraService';
import { listarVentas, obtenerDetalleVenta, anularVenta } from '../services/ventaHistorialService';
import { abrirCaja, cerrarCaja, obtenerArqueoAbierto, listarArqueos } from '../services/arqueoCajaService';
import { autenticar, cerrarSesionUsuario } from '../services/usuarioService';
import { obtenerStockCritico } from '../services/stockService';
import { verificarConexion, guardarVentaOffline, getVentasPendientes, getVentasFallidas, olvidarVentaFallida, sincronizarVentasPendientes, guardarCarritoUI, recuperarCarritoUI, buscarProductosCache, cacheProductos } from '../services/offlineService';
import { registrarVenta as registrarVentaCore } from '../services/ventaService';
import { registrarMovimiento, listarMovimientos } from '../services/cajaMovimientoService';
import { listarCuentas, crearCuenta, actualizarEstadoCuenta } from '../services/cuentaService';
import { listarEnvases } from '../services/envaseService';
import { listarProveedores, crearProveedor, registrarCompra, listarCompras } from '../services/compraService';
import { listarImpresoras, guardarImpresoraConfig, obtenerImpresoraConfig, obtenerComercio, guardarComercio } from '../services/configService';
import { listarClientes, crearCliente, actualizarLimiteCredito, registrarCompraFiado, registrarAmortizacion, eliminarCliente } from '../services/clienteFiadoService';
import { log } from '../services/logger';
import type { ActualizarProductoInput, ProductoFaltante } from '../../shared/types/productos';
import type { Resultado } from '../../shared/types/api';
import type { DatosTicket, DatosTicketZ } from '../../shared/types/ventas';
import type { Comercio } from '../../shared/config/comercio';
import { CANALES } from '../../shared/ipc/canales';
import { normalizarError } from './errores';

// Envuelve un handler en el contrato que cruza IPC: si sale bien devuelve
// { ok: true, data }, y si tira lo loguea y lo aplana con normalizarError().
// Antes esto eran 66 try/catch identicos copiados uno debajo del otro.
//
// El tag del log sale del nombre del canal ('ventas:registrar' ->
// '[ipc.ventas.registrar]'), que es exactamente lo que estaba escrito a mano
// en cada handler, asi que la salida del log no cambia.
function registrar<A extends unknown[], T>(
  canal: string,
  fn: (...args: A) => Promise<T> | T,
): void {
  ipcMain.handle(canal, async (_evt, ...args: A): Promise<Resultado<T>> => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      log.error(`[ipc.${canal.replace(':', '.')}]`, err);
      return normalizarError(err);
    }
  });
}

export function registrarHandlersIPC(): void {
  registrar(CANALES.productosObtener, async (codigoBarras: string) => {
    const producto = await obtenerProducto(codigoBarras);
    return producto;
  });

  registrar(CANALES.productosBuscar, async (query: string) => {
    try {
      // Contra la base, no contra el cache: el cajero puede agregar la linea
      // desde este desplegable, asi que el precio y el stock tienen que ser
      // los de ahora. El cache queda como respaldo si la base no responde.
      return await buscarProductos(query);
    } catch (err) {
      log.warn('[ipc.productos.buscar] sin base, respondo desde el cache local', err);
      // Si el cache tambien falla, la excepcion sube al envoltorio, que la
      // loguea con el mismo tag y la aplana igual que antes.
      return buscarProductosCache(query);
    }
  });

  registrar(CANALES.ventasRegistrar, async (input: VentaInput) => {
    const resultado = await registrarVenta(input);
    return resultado;
  });

  registrar(CANALES.ticketImprimir, async (datos: DatosTicket) => {
    await imprimirTicket(datos);
    return null;
  });

  registrar(CANALES.ventasListar, async (desde?: string, hasta?: string, idUsuario?: number) => {
    const ventas = await listarVentas(desde, hasta, idUsuario);
    return ventas;
  });

  registrar(CANALES.ventasDetalle, async (idVenta: number) => {
    const detalle = await obtenerDetalleVenta(idVenta);
    return detalle;
  });

  registrar(CANALES.ventasAnular, async (idVenta: number) => {
    const venta = await anularVenta(idVenta);
    return venta;
  });

  registrar(CANALES.cajaAbrir, async (fondoInicial: number, idUsuario?: number) => {
    const arqueo = await abrirCaja(fondoInicial, idUsuario);
    return arqueo;
  });

  registrar(CANALES.cajaCerrar, async (idArqueo: number, fondoDeclarado: number, idUsuario?: number) => {
    const arqueo = await cerrarCaja(idArqueo, fondoDeclarado, idUsuario);
    return arqueo;
  });

  registrar(CANALES.cajaArqueoAbierto, async (idUsuario?: number) => {
    const arqueo = await obtenerArqueoAbierto(idUsuario);
    return arqueo;
  });

  registrar(CANALES.cajaListarArqueos, async () => {
    const arqueos = await listarArqueos();
    return arqueos;
  });

  registrar(CANALES.usuariosAutenticar, async (nombre: string, password: string) => {
    const usuario = await autenticar(nombre, password);
    return usuario;
  });

  registrar(CANALES.usuariosCerrarSesion, async () => {
    await cerrarSesionUsuario();
    return null;
  });

  registrar(CANALES.stockCritico, async () => {
    const productos = await obtenerStockCritico();
    return productos;
  });

  registrar(CANALES.ticketNotaCredito, async (datos: DatosTicket) => {
    await imprimirNotaCredito(datos);
    return null;
  });

  registrar(CANALES.ticketArqueoZ, async (datos: DatosTicketZ) => {
    await imprimirTicketZ(datos);
    return null;
  });

  // --- Caja Movimientos ---

  registrar(CANALES.cajaRegistrarMovimiento, async (idArqueo: number, tipo: 'entrada' | 'retirada', monto: number, concepto?: string) => {
    const mov = await registrarMovimiento(idArqueo, tipo, monto, concepto);
    return mov;
  });

  registrar(CANALES.cajaListarMovimientos, async (idArqueo: number) => {
    const movs = await listarMovimientos(idArqueo);
    return movs;
  });

  // --- Cuentas ---

  registrar(CANALES.cuentasListar, async (tabla: 'pagar' | 'recibir') => {
    const cuentas = await listarCuentas(tabla);
    return cuentas;
  });

  registrar(CANALES.cuentasCrear, async (tabla: 'pagar' | 'recibir', datos: Record<string, unknown>) => {
    const cuenta = await crearCuenta(tabla, datos);
    return cuenta;
  });

  registrar(CANALES.cuentasActualizarEstado, async (tabla: 'pagar' | 'recibir', id: number, estado: string, saldo?: number) => {
    const cuenta = await actualizarEstadoCuenta(tabla, id, estado, saldo);
    return cuenta;
  });

  // --- Informes ---

  registrar(CANALES.informesGanancias, async (desde?: string, hasta?: string, idUsuario?: number) => {
    const { obtenerGanancias } = await import('../services/informeService');
    const data = await obtenerGanancias(desde, hasta, idUsuario);
    return data;
  });

  registrar(CANALES.informesGananciaTotal, async (desde?: string, hasta?: string, idUsuario?: number) => {
    const { obtenerGananciaTotal } = await import('../services/informeService');
    const data = await obtenerGananciaTotal(desde, hasta, idUsuario);
    return data;
  });

  registrar(CANALES.informesEnvases, async (desde?: string, hasta?: string, idUsuario?: number) => {
    const { obtenerReporteEnvases } = await import('../services/informeService');
    const data = await obtenerReporteEnvases(desde, hasta, idUsuario);
    return data;
  });

  registrar(CANALES.informesTopProductos, async (desde?: string, hasta?: string, idUsuario?: number) => {
    const { obtenerTopProductos } = await import('../services/informeService');
    const data = await obtenerTopProductos(desde, hasta, idUsuario);
    return data;
  });

  registrar(CANALES.informesVentasPorHora, async (desde?: string, hasta?: string, idUsuario?: number) => {
    const { obtenerVentasPorHora } = await import('../services/informeService');
    const data = await obtenerVentasPorHora(desde, hasta, idUsuario);
    return data;
  });

  registrar(CANALES.informesGananciaTotalNeta, async (desde?: string, hasta?: string, idUsuario?: number) => {
    const { obtenerGananciaTotalNeta } = await import('../services/informeService');
    const data = await obtenerGananciaTotalNeta(desde, hasta, idUsuario);
    return data;
  });

  // --- Archivo / CSV ---

  registrar(CANALES.archivoGuardarCsv, async (contenido: string, nombreDefecto: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: nombreDefecto,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (canceled || !filePath) return false;
    const bom = '\uFEFF';
    await writeFile(filePath, bom + contenido, 'utf-8');
    log.info(`CSV exportado: ${filePath}`);
    return true;
  });

  // --- Archivo / Excel ---

  // El libro se arma acá, no en la pantalla: exceljs corre nativo en el main,
  // y así el bundle del renderer no carga una librería de Excel entera.
  registrar(CANALES.archivoExportarVentas, async (desde?: string, hasta?: string, idUsuario?: number) => {
    const { construirLibroVentas } = await import('../services/exportacionService');
    const { buffer, ventas } = await construirLibroVentas(desde, hasta, idUsuario);
    if (ventas === 0) return { guardado: false, ventas: 0 };

    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: `ventas_${new Date().toISOString().slice(0, 10)}.xlsx`,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    });
    if (canceled || !filePath) return { guardado: false, ventas };

    await writeFile(filePath, buffer);
    log.info(`Excel exportado: ${filePath}`);
    return { guardado: true, ventas };
  });

  registrar(CANALES.archivoGuardarExcel, async (base64: string, nombreDefecto: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: nombreDefecto,
      filters: [{ name: 'Excel', extensions: ['xlsx'] }],
    });
    if (canceled || !filePath) return false;
    const buffer = Buffer.from(base64, 'base64');
    await writeFile(filePath, buffer);
    log.info(`Excel exportado: ${filePath}`);
    return true;
  });

  // --- Offline ---

  registrar(CANALES.offlineVerificarConexion, async () => {
    const conectado = await verificarConexion();
    return conectado;
  });

  registrar(CANALES.offlineEstado, async () => {
    const conectado = await verificarConexion();
    const pendientes = getVentasPendientes().length;
    // Las fallidas viajan en el mismo estado que ya se consulta cada 30
    // segundos: son plata cobrada que espera carga manual, y hasta ahora no
    // había forma de enterarse de que existían sin abrir el JSON del disco.
    const fallidas = getVentasFallidas().length;
    return { conectado, pendientes, fallidas };
  });

  registrar(CANALES.offlineGuardarVenta, async (input: VentaInput) => {
    guardarVentaOffline(input);
    return null;
  });

  registrar(CANALES.offlineVentasPendientes, async () => {
    const pendientes = getVentasPendientes();
    return pendientes;
  });

  registrar(CANALES.offlineVentasFallidas, async () => {
    const fallidas = getVentasFallidas();
    return fallidas;
  });

  // Se descarta una vez que el cajero la cargó a mano. Es el único camino que
  // borra una venta fallida: no hay purga automática, porque el criterio para
  // darla por resuelta lo tiene la persona, no el sistema.
  registrar(CANALES.offlineOlvidarFallida, async (idTemp: string) => {
    olvidarVentaFallida(idTemp);
    return null;
  });

  registrar(CANALES.offlineSincronizar, async () => {
    const resultado = await sincronizarVentasPendientes(registrarVentaCore);
    return resultado;
  });

  registrar(CANALES.carritoGuardar, async (data: unknown) => {
    guardarCarritoUI(data);
    return null;
  });

  registrar(CANALES.carritoRecuperar, async () => {
    const data = recuperarCarritoUI();
    return data;
  });

  // --- Envases ---

  registrar(CANALES.envasesListar, async () => {
    const envases = await listarEnvases();
    return envases;
  });

  // --- Códigos de Barras ---

  registrar(CANALES.productosGenerarCodigo, async (productoId?: number) => {
    const codigo = generarCodigoEAN13(productoId);
    return codigo;
  });

  registrar(CANALES.productosImprimirEtiqueta, async (datos: { codigo: string; nombre: string; precio: number }) => {
    await imprimirEtiquetaCodigo(datos);
    return null;
  });

  registrar(CANALES.productosActualizarCodigo, async (codigoActual: string, nuevoCodigo: string) => {
    await actualizarCodigoBarras(codigoActual, nuevoCodigo);
    return null;
  });

  registrar(CANALES.productosListar, async (termino?: string) => {
    const data = await listarProductos(termino);
    return data;
  });

  registrar(CANALES.productosActualizar, async (codigoBarras: string, cambios: ActualizarProductoInput) => {
    await actualizarProducto(codigoBarras, cambios);
    cacheProductos(true);
    return null;
  });

  registrar(CANALES.productosCrear, async (input: CrearProductoInput) => {
    const data = await crearProducto(input);
    cacheProductos(true);
    return data;
  });

  registrar(CANALES.productosEliminar, async (codigoBarras: string) => {
    await eliminarProducto(codigoBarras);
    cacheProductos(true);
    return null;
  });

  // --- Proveedores / Compras ---

  registrar(CANALES.proveedoresListar, async () => {
    const data = await listarProveedores();
    return data;
  });

  registrar(CANALES.proveedoresCrear, async (datos: { ruc?: string; razon_social: string; telefono?: string; contacto?: string }) => {
    const data = await crearProveedor(datos);
    return data;
  });

  registrar(CANALES.comprasRegistrar, async (datos: { id_proveedor?: number; factura_numero?: string; lineas: { codigo_barras: string; cantidad: number; precio_costo: number }[] }, idUsuario?: number) => {
    const data = await registrarCompra(datos, idUsuario);
    return data;
  });

  registrar(CANALES.comprasListar, async (desde?: string, hasta?: string, idUsuario?: number) => {
    const data = await listarCompras(desde, hasta, idUsuario);
    return data;
  });

  // --- Clientes / Fiado ---

  registrar(CANALES.clientesListar, async () => {
    const data = await listarClientes();
    return data;
  });

  registrar(CANALES.clientesCrear, async (datos: { nombre: string; ruc?: string; telefono?: string; limite_credito?: number }) => {
    const data = await crearCliente(datos);
    return data;
  });

  registrar(CANALES.clientesActualizarLimite, async (idCliente: number, limite: number) => {
    await actualizarLimiteCredito(idCliente, limite);
    return null;
  });

  registrar(CANALES.clientesRegistrarCompraFiado, async (idCliente: number, idVenta: number, total: number) => {
    await registrarCompraFiado(idCliente, idVenta, total);
    return null;
  });

  registrar(CANALES.clientesRegistrarAmortizacion, async (idCliente: number, monto: number) => {
    await registrarAmortizacion(idCliente, monto);
    return null;
  });

  registrar(CANALES.clientesEliminar, async (idCliente: number) => {
    await eliminarCliente(idCliente);
    return null;
  });

  // Estos tres son sincronos y no tenian try/catch propio. Pasan por el mismo
  // envoltorio para no ser la excepcion de la casa; de paso, si alguna vez
  // tiran, salen aplanados como Resultado en vez de romper el canal.
  registrar(CANALES.ventanaMinimizar, () => {
    BrowserWindow.getFocusedWindow()?.minimize();
    return null;
  });

  registrar(CANALES.ventanaMaximizar, () => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return null;
    if (win.isMaximized()) win.unmaximize();
    else win.maximize();
    return null;
  });

  registrar(CANALES.ventanaCerrar, () => {
    BrowserWindow.getFocusedWindow()?.close();
    return null;
  });

  // ================================================================
  // Auto-updater
  // ================================================================

  registrar(CANALES.actualizarCheck, async () => {
    const { checkForUpdates } = await import('../services/autoUpdater');
    const info = await checkForUpdates();
    return info;
  });

  registrar(CANALES.actualizarDescargar, async () => {
    const { descargarEInstalar } = await import('../services/autoUpdater');
    const ok = await descargarEInstalar();
    return ok;
  });

  // ================================================================
  // Backup
  // ================================================================

  registrar(CANALES.backupRealizar, async () => {
    const { realizarBackup } = await import('../services/backupService');
    const archivo = await realizarBackup();
    return archivo;
  });

  // ================================================================
  // Importación de Productos por Excel
  // ================================================================

  // La unica que no pasa por registrar(): decide el ok/error por el contenido
  // de la respuesta, no por una excepcion, y devuelve un error sin `detalle`.
  // Meterla en el envoltorio le cambiaria la forma al Resultado.
  ipcMain.handle(CANALES.productosImportarExcel, async () => {
    const { importarExcel } = await import('../services/importacionService');
    try {
      const resultado = await importarExcel();
      return resultado.ok
        ? { ok: true, data: resultado }
        : { ok: false, codigo: 'IMPORT_ERROR', mensaje: resultado.error };
    } catch (err) {
      log.error('[ipc.productos.importar-excel]', err);
      return normalizarError(err);
    }
  });

  // ================================================================
  // Lista de Compras (Stock)
  // ================================================================

  registrar(CANALES.stockListaCompras, async (stockMinimo?: number) => {
    const { obtenerListaCompras } = await import('../services/stockPrintService');
    const lista = await obtenerListaCompras(stockMinimo);
    return lista;
  });

  registrar(CANALES.stockImprimirLista, async (productos: ProductoFaltante[]) => {
    const { imprimirListaCompras } = await import('../services/stockPrintService');
    const ok = await imprimirListaCompras(productos);
    return ok;
  });

  // ================================================================
  // Categorías
  // ================================================================

  registrar(CANALES.categoriasListar, async () => {
    const { listarCategorias } = await import('../services/categoriaService');
    const data = await listarCategorias();
    return data;
  });

  registrar(CANALES.categoriasCrear, async (nombre: string, color?: string) => {
    const { crearCategoria } = await import('../services/categoriaService');
    const data = await crearCategoria(nombre, color);
    return data;
  });

  registrar(CANALES.categoriasEliminar, async (id: number) => {
    const { eliminarCategoria } = await import('../services/categoriaService');
    await eliminarCategoria(id);
    return null;
  });

  // ================================================================
  // Devoluciones
  // ================================================================

  registrar(CANALES.devolucionesCrear, async (input: { id_venta: number; id_usuario?: number; motivo?: string; lineas: { codigo_barras: string; cantidad: number; precio_unitario: number }[] }) => {
    const { crearDevolucion } = await import('../services/devolucionService');
    const data = await crearDevolucion(input);
    return data;
  });

  registrar(CANALES.devolucionesListar, async (idVenta: number) => {
    const { listarDevolucionesPorVenta } = await import('../services/devolucionService');
    const data = await listarDevolucionesPorVenta(idVenta);
    return data;
  });

  // ================================================================
  // Configuración
  // ================================================================

  registrar(CANALES.configObtenerComercio, async () => {
    return obtenerComercio();
  });

  registrar(CANALES.configGuardarComercio, async (datos: Comercio) => {
    return guardarComercio(datos);
  });

  registrar(CANALES.configListarImpresoras, async () => {
    const impresoras = await listarImpresoras();
    const actual = obtenerImpresoraConfig();
    return { impresoras, actual };
  });

  registrar(CANALES.configGuardarImpresora, async (nombre: string) => {
    guardarImpresoraConfig(nombre);
    return null;
  });

  registrar(CANALES.configTestImpresora, async () => {
    await testImpresora();
    return null;
  });
}