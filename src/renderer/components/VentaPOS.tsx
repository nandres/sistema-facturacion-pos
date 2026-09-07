import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Producto } from '../../shared/types/productos';
import type { MedioPago, MedioPagoManual, TipoPago, VentaInput, DatosTicket, Envase, PagoInput } from '../../shared/types/ventas';
import { formatearGs, formatearGsConPrefijo } from '../utils/formatoGuarani';
import { useComercio } from '../contexts/ComercioContext';
import ProductEditorModal from './ProductEditorModal';
import { playCobrar, playError, playScan } from '../utils/soundService';
import { useAtajos } from '../hooks/useAtajos';
import {
  Aviso, Caja, Campo, Fila, GrillaOps, Modal, Semaforo, Tecla, TecladoNumerico,
  TituloModulo, Vacio, type Operacion,
} from '../ui';
import type { ReactNode } from 'react';
import {
  calcularIvaPorTasa, calcularBasePorTasa, calcularTotal, calcularIvaTotal,
  calcularDescuentoTotal, descuentoLinea as descuentoDeLinea,
} from '../../shared/calculos/fiscal';
import {
  sumarPagos, calcularVuelto, calcularFaltante, determinarTipoPago, siguienteImporte,
} from '../../shared/calculos/pagos';
import { creditoDisponible, buscarPorNombre } from '../../shared/clientes/fiado';
import { useFiado, type CondicionVenta } from '../hooks/useFiado';

interface Props {
  idUsuario: number;
  nombreCajero: string;
  /** Estado de Supabase. Lo consulta App cada 30s; no lo repetimos aca. */
  conectado: boolean;
  /** Ventas guardadas localmente esperando sincronizacion. */
  pendientes: number;
}

/**
 * Identificador del puesto de caja. Es por terminal, no por comercio, asi que
 * vive en el almacenamiento local de esta maquina. Se puede fijar desde la
 * consola con `localStorage.setItem('nroCaja', '03')` hasta que exista una
 * pantalla de configuracion que lo haga.
 */
function leerNroCaja(): string {
  try {
    return localStorage.getItem('nroCaja') || '01';
  } catch {
    return '01';
  }
}
// teclado del cajero solo escribe enteros vía botones +/-, no escribe a
// mano. Para productos por peso, la balanza debería precargar el código.
interface LineaCarrito {
  codigo_barras: string;
  nombre: string;
  precio_unitario: number;
  cantidad: number;
  stock_disponible: number;
  iva: number;
  envase?: { id_envase: number; nombre: string; precio: number; trajo: boolean };
}

// Denominaciones rápidas más usadas en caja de supermercado paraguayo.
// Cubren ~85% de los pagos en efectivo de tickets chicos/medianos.
  const DENOMINACIONES_RAPIDAS = [20000, 50000, 100000] as const;

  // Nombre que se muestra en el visor del importe. El <select> los abrevia por
  // ancho; el visor tiene lugar para el nombre entero.
  const ETIQUETA_MEDIO: Record<MedioPagoManual, string> = {
    efectivo: 'Efectivo',
    tarjeta: 'Tarjeta',
    transferencia: 'Transferencia',
    cheque: 'Cheque',
  };

// Cuanto esperamos como maximo por la revalidacion de precios antes de cobrar.
// Pasado ese tiempo se cobra igual: la caja no se frena por la red.
const TIMEOUT_REVALIDACION_MS = 800;

export default function VentaPOS({ idUsuario, nombreCajero, conectado, pendientes }: Props): JSX.Element {
  const { comercio, rucLinea } = useComercio();
  const [carrito, setCarrito] = useState<LineaCarrito[]>([]);
  const [codigoEscaneo, setCodigoEscaneo] = useState('');
  const [pagos, setPagos] = useState<PagoInput[]>([]);
  const montoRecibido = useMemo(() => sumarPagos(pagos), [pagos]);
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [mensajeInfo, setMensajeInfo] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [confirmandoCancelar, setConfirmandoCancelar] = useState(false);
  const [modoCantidad, setModoCantidad] = useState(false);
  const [modoBascula, setModoBascula] = useState(false);
  const [pesoPendiente, setPesoPendiente] = useState<number | null>(null);
  const [carritoRecuperado, setCarritoRecuperado] = useState(false);
  const [datosTicketPreview, setDatosTicketPreview] = useState<DatosTicket | null>(null);
  const [sugerencias, setSugerencias] = useState<Producto[]>([]);
  const [indiceSeleccionado, setIndiceSeleccionado] = useState(-1);
  const [dropdownAbierto, setDropdownAbierto] = useState(false);
  const [ventaRetenida, setVentaRetenida] = useState<{ carrito: LineaCarrito[]; pagos: PagoInput[] } | null>(null);
  const [errorTicket, setErrorTicket] = useState('');
  const [envasesList, setEnvasesList] = useState<Envase[]>([]);
  // Solo los medios que el cajero elige a mano: `credito` lo pone el sistema
  // cuando la venta va a la cuenta corriente, no se ofrece en el selector.
  const [medioPagoSel, setMedioPagoSel] = useState<MedioPagoManual>('efectivo');
  const [editorAbierto, setEditorAbierto] = useState(false);
  const [codigoCrearProducto, setCodigoCrearProducto] = useState<string | null>(null);
  const [categorias, setCategorias] = useState<{ id_categoria: number; nombre: string; color: string }[]>([]);
  const [catSeleccionada, setCatSeleccionada] = useState<number | null>(null);
  const [productosPorCat, setProductosPorCat] = useState<Producto[]>([]);
  const [catCargando, setCatCargando] = useState(false);
  const [mostrarBrowser, setMostrarBrowser] = useState(false);

  // Venta a credito, cliente y cabecera fiscal. RUC y razon social son el
  // selector de cliente puesto arriba: cuando se elige un cliente se llenan
  // solos, y al pasar la venta a credito son los que identifican a quien se le
  // fia. Por eso viven en el mismo hook que el panel de credito.
  const {
    modoFiado, setModoFiado,
    clienteFiadoSel, setClienteFiadoSel,
    clientesFiado,
    resultadosFiado, setResultadosFiado,
    indiceFiadoSel, setIndiceFiadoSel,
    showCrearCliente, setShowCrearCliente,
    nuevoClienteNombre, setNuevoClienteNombre,
    nuevoClienteRuc, setNuevoClienteRuc,
    nuevoClienteTel, setNuevoClienteTel,
    nuevoClienteLimite, setNuevoClienteLimite,
    rucCliente, setRucCliente,
    razonSocial, setRazonSocial,
    clienteSeleccionado,
    condicionVenta,
    cargarClientesFiado,
    toggleFiado,
    aplicarCliente,
    buscarClientePorRuc,
  } = useFiado();

  const [estadoImpresora, setEstadoImpresora] = useState<'ok' | 'sin-config' | 'consultando'>('consultando');
  const [nroCaja] = useState(leerNroCaja);

  // Linea sobre la que actuan F3 (cantidad) y F4 (anular). Arranca en la
  // ultima escaneada, que es lo que el cajero quiere corregir el 99% de las
  // veces; las flechas mueven la seleccion cuando el desplegable esta cerrado.
  const [lineaSel, setLineaSel] = useState(-1);

  const inputEscaneoRef = useRef<HTMLInputElement>(null);
  const inputRucRef = useRef<HTMLInputElement>(null);
  const cobrarRef = useRef(cobrar);
  cobrarRef.current = cobrar;
  const carritoRef = useRef(carrito);
  carritoRef.current = carrito;
  const timeoutBusqueda = useRef<ReturnType<typeof setTimeout>>();
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Queda aca y no en useFiado porque devuelve el foco al input de escaneo,
  // que es cosa de la caja y no del credito.
  function cambiarCondicion(cond: CondicionVenta) {
    if ((cond === 'credito') !== modoFiado) toggleFiado();
    refocarEscaneo();
  }

  // Total, IVA y bases salen todos de `fiscal.ts`, de la misma definicion de
  // «cuanto se cobra por esta linea». Estaban recalculados aca con la misma
  // formula, que es justo la duplicacion que causo A-06.
  const total = useMemo(() => calcularTotal(carrito), [carrito]);

  const vuelto = useMemo(() => calcularVuelto(montoRecibido, total), [montoRecibido, total]);

  const faltante = useMemo(() => calcularFaltante(montoRecibido, total), [montoRecibido, total]);

  // El IVA se calcula sobre lo que se cobra, con el envase devuelto ya
  // descontado: la misma expresión que `total` y que `basePorTasa`.
  //
  // Antes usaba `precio_unitario * cantidad` sin descontar el envase, así que
  // el comprobante sobredeclaraba IVA cada vez que entraba uno. Con una
  // gaseosa de 12.500 al 10% y envase de 3.000 devuelto se cobran 9.500 y el
  // ticket declaraba 1.136 en vez de 863; el recuadro fiscal quedaba
  // contradictorio consigo mismo, mostrando «Gravadas 10%: 9.500» al lado de
  // un IVA calculado sobre 12.500.
  const ivaPorTasa = useMemo(() => calcularIvaPorTasa(carrito), [carrito]);

  const ivaTotal = useMemo(() => calcularIvaTotal(carrito), [carrito]);

  // Desglose para el recuadro fiscal. En Paraguay el precio de gondola ya trae
  // el IVA adentro, asi que cada casillero lleva el importe cobrado --con IVA--
  // y el IVA es la porcion de ese importe que le toca a la DNIT.
  //
  // Se calcula con la misma expresion que `total`, descuento de envase incluido,
  // para que Exentas + Gravadas 5% + Gravadas 10% de exactamente el TOTAL A
  // PAGAR. Es lo primero que cualquiera cruza al mirar el recuadro.
  const basePorTasa = useMemo(() => calcularBasePorTasa(carrito), [carrito]);

  // Descuento de la linea: hoy la unica fuente es el envase devuelto.
  const descuentoLinea = useCallback((l: LineaCarrito) => descuentoDeLinea(l), []);

  const descuentoTotal = useMemo(() => calcularDescuentoTotal(carrito), [carrito]);

  useEffect(() => {
    inputEscaneoRef.current?.focus();
    window.api.envases.listar().then((r) => { if (r.ok) setEnvasesList(r.data); });
    window.api.categorias.listar().then((r) => { if (r.ok) setCategorias(r.data); });
    // Los clientes se cargan desde el arranque, no recien al fiar: el RUC de la
    // cabecera busca contra esta lista y tiene que responder en la primera venta.
    cargarClientesFiado();
    // Estado de la ticketera: hay impresora elegida y Windows la sigue viendo.
    // No imprime nada para averiguarlo; listarImpresoras ya devuelve la actual.
    window.api.config.listarImpresoras().then((r) => {
      if (!r.ok) { setEstadoImpresora('sin-config'); return; }
      const { impresoras, actual } = r.data;
      setEstadoImpresora(actual && impresoras.includes(actual) ? 'ok' : 'sin-config');
    }).catch(() => setEstadoImpresora('sin-config'));
  }, []);

  // Red de seguridad: la seleccion no puede quedar apuntando fuera del carrito
  // despues de anular una linea. Quien agrega la mueve explicitamente.
  useEffect(() => {
    setLineaSel((prev) => (prev >= carrito.length ? carrito.length - 1 : prev));
  }, [carrito.length]);

  // Recuperar carrito guardado al montar
  useEffect(() => {
    (async () => {
      const r = await window.api.carrito.recuperar();
      if (r.ok && r.data && r.data.carrito && r.data.carrito.length > 0) {
        setCarrito(r.data.carrito);
        setPagos(r.data.pagos ?? []);
        setCarritoRecuperado(true);
      }
    })();
  }, []);

  // Persistir carrito con debounce (cada 3s si hay cambios)
  useEffect(() => {
    if (carritoRecuperado) setCarritoRecuperado(false); // solo el primer restore
    const timer = setInterval(() => {
      if (carritoRef.current.length > 0) {
        window.api.carrito.guardar({
          carrito: carritoRef.current,
          montoRecibido: montoRecibido,
          pagos: pagos,
          timestamp: Date.now(),
        });
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [carritoRecuperado, pagos]);


  // Atajos de la pantalla de caja. Se registran con prioridad de pantalla, asi
  // que tienen precedencia sobre la navegacion global de App.
  //
  // El mapa se lee en cada pulsacion, no se captura al suscribir: antes este
  // efecto dependia de `carrito.length` y no de `pagos` ni del carrito completo,
  // asi que retener una venta guardaba una copia vieja del carrito y sin pagos.
  useAtajos({
    // `void`: el manejador devuelve void/boolean, no la promesa del cobro.
    F12: () => { void cobrarRef.current(); },

    // F1 — datos del cliente. El foco va al RUC, que es por donde se arranca:
    // si el cliente ya existe, la razon social se completa sola.
    F1: () => {
      inputRucRef.current?.focus();
      inputRucRef.current?.select();
    },

    // F2 — buscar. El campo de escaneo es tambien el buscador: escribiendo
    // letras en vez de pasar un codigo se abre el desplegable de productos.
    F2: () => {
      inputEscaneoRef.current?.focus();
      inputEscaneoRef.current?.select();
    },

    // F3 — cantidad. Misma puerta que `*`, para el que prefiere las de arriba.
    F3: () => {
      if (carrito.length === 0) return;
      setModoBascula(false);
      setModoCantidad(true);
      setCodigoEscaneo('');
      refocarEscaneo();
    },

    // F4 — anular la linea seleccionada, que por defecto es la ultima leida.
    F4: () => {
      const idx = lineaSel >= 0 && lineaSel < carrito.length ? lineaSel : carrito.length - 1;
      if (idx < 0) return;
      const linea = carrito[idx];
      quitarLinea(linea.codigo_barras);
      setMensajeInfo(`Línea anulada: ${linea.nombre}`);
    },

    // Retener / recuperar la venta en curso.
    F7: () => {
      if (ventaRetenida) {
        setCarrito(ventaRetenida.carrito);
        setPagos(ventaRetenida.pagos);
        setVentaRetenida(null);
        setMensajeInfo('Venta retenida recuperada.');
        return;
      }
      if (carrito.length === 0) return false;
      setVentaRetenida({ carrito: [...carrito], pagos: [...pagos] });
      resetearCarritoSinMsg();
      setMensajeInfo('Venta retenida. Presione F7 para recuperarla.');
    },

    // Escape cierra de a una capa, de la mas superficial a la mas profunda.
    Escape: () => {
      if (dropdownAbierto) {
        setDropdownAbierto(false);
        setSugerencias([]);
        return;
      }
      if (datosTicketPreview) {
        setDatosTicketPreview(null);
        resetearCarrito();
        return;
      }
      if (confirmandoCancelar) {
        setConfirmandoCancelar(false);
        return;
      }
      if (pesoPendiente !== null) {
        setPesoPendiente(null);
        setModoBascula(false);
        setCodigoEscaneo('');
        return;
      }
      if (modoCantidad) {
        setModoCantidad(false);
        setCodigoEscaneo('');
        return;
      }
      if (carrito.length > 0) {
        setConfirmandoCancelar(true);
        return;
      }
      return false;
    },
  });

  // Auto-dismiss de notificaciones toast
  useEffect(() => {
    if (!mensajeError && !mensajeInfo) return;
    const timer = setTimeout(limpiarMensajes, 6000);
    return () => clearTimeout(timer);
  }, [mensajeError, mensajeInfo]);

  const refocarEscaneo = useCallback(() => {
    // setTimeout para correr después del render que pueda haber cambiado
    // el árbol de elementos (botones que aparecen/desaparecen).
    setTimeout(() => inputEscaneoRef.current?.focus(), 0);
  }, []);

  function limpiarMensajes() {
    setMensajeError(null);
    setMensajeInfo(null);
  }

  async function manejarEscaneo(evento: React.KeyboardEvent<HTMLInputElement>) {
    if (evento.key === '*') {
      evento.preventDefault();
      if (carrito.length === 0) return;
      if (modoBascula) setModoBascula(false);
      setModoCantidad(true);
      setCodigoEscaneo('');
      return;
    }
    if (evento.key !== 'Enter') return;
    evento.preventDefault();

    const codigo = codigoEscaneo.trim();
    if (codigo === '') {
      if (modoCantidad) setModoCantidad(false);
      return;
    }

    limpiarMensajes();

    // Modo cantidad (*)
    if (modoCantidad) {
      const cantidad = parseInt(codigo, 10);
      if (Number.isFinite(cantidad) && cantidad > 0) {
        setCarrito((prev) => {
          if (prev.length === 0) return prev;
          // Sobre la linea seleccionada. Sin seleccion movida a mano cae en la
          // ultima, que es como se comportaba cuando `*` era la unica entrada.
          const idx = lineaSel >= 0 && lineaSel < prev.length ? lineaSel : prev.length - 1;
          const objetivo = prev[idx];
          const nuevaCantidad = Math.min(cantidad, objetivo.stock_disponible);
          const copia = [...prev];
          copia[idx] = { ...objetivo, cantidad: nuevaCantidad };
          return copia;
        });
        setMensajeInfo(`Cantidad actualizada a ${cantidad}.`);
      }
      setModoCantidad(false);
      setCodigoEscaneo('');
      return;
    }

    // Modo báscula: el valor ingresado es el peso en gramos
    if (modoBascula) {
      const pesoGramos = parseInt(codigo, 10);
      if (Number.isFinite(pesoGramos) && pesoGramos > 0) {
        const pesoKg = pesoGramos / 1000;
        setPesoPendiente(pesoKg);
        setMensajeInfo(`Peso capturado: ${pesoKg.toFixed(3)} kg. Escanee el producto.`);
        setCodigoEscaneo('');
      } else {
        setMensajeError('Peso inválido. Ingrese el peso en gramos (ej: 1500 = 1.5 kg).');
      }
      return;
    }

    setCodigoEscaneo('');

    try {
      const respuesta = await window.api.productos.obtener(codigo);
      if (!respuesta.ok) {
        setMensajeError(respuesta.mensaje);
        return;
      }
      const producto = respuesta.data;
      if (!producto) {
        setCodigoCrearProducto(codigo);
        setEditorAbierto(true);
        return;
      }
      setCodigoCrearProducto(null);
      agregarAlCarrito(producto);
    } catch (err) {
      console.error('[VentaPOS.manejarEscaneo]', err);
      setMensajeError('Error al consultar el producto.');
    } finally {
      refocarEscaneo();
    }
  }

  function agregarAlCarrito(producto: Producto) {
    if (producto.stock <= 0) {
      setMensajeError(`Sin stock: ${producto.nombre}`);
      return;
    }

    const cantidadBascula = pesoPendiente !== null ? pesoPendiente : 1;
    if (pesoPendiente !== null) setPesoPendiente(null);

    playScan();

    // La linea que se acaba de tocar queda seleccionada: es sobre la que van a
    // caer F3 (cantidad) y F4 (anular) si el cajero corrige enseguida.
    const idxPrevio = carrito.findIndex((l) => l.codigo_barras === producto.codigo_barras);
    setLineaSel(idxPrevio === -1 ? carrito.length : idxPrevio);

    setCarrito((prev) => {
      const idx = prev.findIndex((l) => l.codigo_barras === producto.codigo_barras);
      if (idx === -1) {
        return [
          ...prev,
          {
            codigo_barras: producto.codigo_barras,
            nombre: producto.nombre,
            precio_unitario: producto.precio_venta,
            cantidad: cantidadBascula,
            stock_disponible: producto.stock,
            iva: producto.iva,
          },
        ];
      }
      const existente = prev[idx];
      if (existente.cantidad + cantidadBascula > existente.stock_disponible) {
        setMensajeError(
          `Stock insuficiente para ${existente.nombre} (disponible: ${existente.stock_disponible}).`,
        );
        return prev;
      }
      const copia = [...prev];
      copia[idx] = { ...existente, cantidad: existente.cantidad + cantidadBascula };
      return copia;
    });
    setMensajeInfo(`Agregado: ${producto.nombre}`);
  }

  function cambiarCantidad(codigo: string, delta: number) {
    setCarrito((prev) => {
      const idx = prev.findIndex((l) => l.codigo_barras === codigo);
      if (idx === -1) return prev;
      const linea = prev[idx];
      const nuevaCantidad = linea.cantidad + delta;
      if (nuevaCantidad <= 0) {
        return prev.filter((_, i) => i !== idx);
      }
      if (nuevaCantidad > linea.stock_disponible) {
        setMensajeError(
          `Stock insuficiente para ${linea.nombre} (disponible: ${linea.stock_disponible}).`,
        );
        return prev;
      }
      const copia = [...prev];
      copia[idx] = { ...linea, cantidad: nuevaCantidad };
      return copia;
    });
    refocarEscaneo();
  }

  function quitarLinea(codigo: string) {
    setCarrito((prev) => prev.filter((l) => l.codigo_barras !== codigo));
    refocarEscaneo();
  }

  async function cargarProductosPorCategoria(id: number | null) {
    setCatSeleccionada(id);
    if (id === null) { setProductosPorCat([]); setMostrarBrowser(false); return; }
    setCatCargando(true);
    try {
      const r = await window.api.productos.listar();
      if (r.ok) setProductosPorCat(r.data.filter((p) => p.id_categoria === id));
      setMostrarBrowser(true);
    } finally { setCatCargando(false); }
  }

  // Las dos variantes de reset difieren en una sola cosa: si limpian o no los
  // mensajes en pantalla. La version SinMsg se usa cuando el cajero tiene que
  // seguir viendo el mensaje que ya esta puesto despues de vaciar el carrito.
  function resetear(limpiarMsg: boolean) {
    setCarrito([]);
    setPagos([]);
    setCodigoEscaneo('');
    setConfirmandoCancelar(false);
    setModoCantidad(false);
    setModoBascula(false);
    setPesoPendiente(null);
    setModoFiado(false);
    setClienteFiadoSel(null);
    setResultadosFiado([]);
    setShowCrearCliente(false);
    setRucCliente('');
    setRazonSocial('');
    setLineaSel(-1);
    if (limpiarMsg) limpiarMensajes();
    window.api.carrito.guardar({ carrito: [], montoRecibido: 0, pagos: [], timestamp: 0 });
    refocarEscaneo();
  }

  function resetearCarrito() {
    resetear(true);
  }

  function resetearCarritoSinMsg() {
    resetear(false);
  }

  function agregarPago(medio_pago: MedioPago, monto: number) {
    if (monto <= 0) return;
    setPagos((prev) => [...prev, { medio_pago, monto }]);
  }

  function eliminarPago(idx: number) {
    setPagos((prev) => prev.filter((_, i) => i !== idx));
  }

  const [montoCustomTexto, setMontoCustomTexto] = useState('');
  function agregarPagoCustom() {
    const soloDigitos = montoCustomTexto.replace(/\D/g, '');
    const monto = parseInt(soloDigitos, 10);
    if (monto <= 0) return;
    setPagos((prev) => [...prev, { medio_pago: medioPagoSel, monto }]);
    setMontoCustomTexto('');
  }

  // Relee de la base los productos del carrito y corrige precio y stock si
  // cambiaron desde que se agrego la linea. Devuelve los nombres que cambiaron.
  //
  // Falla abierto a proposito: si la base no contesta dentro del timeout, la
  // venta sigue con los precios que el cajero tiene a la vista. Cobrar nunca
  // se bloquea por un problema de red.
  async function revalidarPrecios(): Promise<string[]> {
    const lineas = carritoRef.current;
    if (lineas.length === 0) return [];

    const consulta = Promise.all(
      lineas.map(async (l) => {
        try {
          const r = await window.api.productos.obtener(l.codigo_barras);
          return r.ok && r.data ? r.data : null;
        } catch {
          return null;
        }
      }),
    );
    const vencimiento = new Promise<null>((resolver) => {
      setTimeout(() => resolver(null), TIMEOUT_REVALIDACION_MS);
    });

    const frescos = await Promise.race([consulta, vencimiento]);
    if (frescos === null) return [];

    const cambiaron: string[] = [];
    const corregido = lineas.map((l, i) => {
      const p = frescos[i];
      if (!p) return l;
      if (p.precio_venta !== l.precio_unitario) {
        cambiaron.push(l.nombre);
        return { ...l, precio_unitario: p.precio_venta, stock_disponible: p.stock };
      }
      return { ...l, stock_disponible: p.stock };
    });
    if (cambiaron.length > 0) setCarrito(corregido);
    return cambiaron;
  }

  /**
   * Encola la venta para cuando vuelva la conexion. Devuelve si quedo guardada.
   *
   * ── POR QUE MIRA EL RESULTADO ────────────────────────────────────────────
   *
   * Antes no lo miraba. `guardarVenta` devuelve `Resultado<T>` como todo lo que
   * cruza IPC, y ese resultado se descartaba: si la escritura fallaba --disco
   * lleno, permisos, el antivirus con el archivo tomado, que en una PC de caja
   * con Windows pasa-- el cajero igual leia «Venta guardada localmente», el
   * carrito se limpiaba y la venta no quedaba en ningun lado. La plata ya
   * estaba cobrada y la mercaderia ya habia salido del local.
   *
   * Era la unica rama del sistema que podia perder una venta en silencio, y es
   * justo la que existe para no perderlas.
   *
   * Si falla, el carrito NO se limpia: es lo unico que todavia tiene las lineas
   * de esa venta, y con el a la vista el cajero puede reintentar o anotarla a
   * mano antes de seguir.
   */
  async function guardarOffline(payload: VentaInput): Promise<boolean> {
    const guardada = await window.api.offline.guardarVenta(payload);
    if (!guardada.ok) {
      playError();
      setMensajeError(
        `NO se pudo registrar la venta, ni en linea ni localmente: ${guardada.mensaje}. ` +
        'El carrito quedo como estaba: anotala a mano antes de seguir cobrando.',
      );
      return false;
    }
    // Primero limpiar, despues avisar. `resetearCarrito()` llama a
    // `limpiarMensajes()`, asi que al reves --que es como estaba-- borraba el
    // aviso que se acababa de poner: el carrito se vaciaba en silencio y el
    // cajero no tenia forma de saber si la venta habia entrado en linea, si
    // habia quedado en la cola, o si no habia pasado nada. Para eso existe la
    // variante que no toca los mensajes.
    resetearCarritoSinMsg();
    setMensajeInfo('Venta guardada localmente (sin conexión). Se sincronizará automáticamente.');
    return true;
  }

  async function cobrar() {
    limpiarMensajes();

    if (carrito.length === 0) {
      setMensajeError('El carrito está vacío.');
      return;
    }
    if (modoFiado) {
      if (clienteFiadoSel === null) {
        setMensajeError('Seleccioná un cliente para la venta a crédito.');
        return;
      }
      const c = clienteSeleccionado;
      if (!c) { setMensajeError('Cliente no encontrado.'); return; }
      const disponible = creditoDisponible(c);
      if (disponible < total) {
        setMensajeError(`El cliente supera su límite de crédito. Disponible: ${formatearGs(disponible)}`);
        return;
      }
    } else {
      if (montoRecibido < total) {
        setMensajeError(`Falta cobrar ${formatearGsConPrefijo(faltante)}.`);
        return;
      }
    }

    // Ultimo control antes de mandar la venta: que el precio de cada linea sea
    // el que esta hoy en la base. Si alguno cambio, se corrige el carrito y no
    // se cobra: el cajero ve el total nuevo y vuelve a apretar Cobrar.
    const preciosCambiados = await revalidarPrecios();
    if (preciosCambiados.length > 0) {
      playError();
      setMensajeError(
        `Cambio el precio de ${preciosCambiados.join(', ')}. Actualicé el total: confirmalo con el cliente y volvé a cobrar.`,
      );
      refocarEscaneo();
      return;
    }

    // Una venta fiada NO es efectivo. Se declaraba así porque el CHECK de la
    // tabla no admitía otra cosa, y el resultado era que el cierre de caja
    // esperaba en el cajón toda la plata que se había fiado en el turno.
    const tipo_pago: TipoPago = modoFiado ? 'credito' : determinarTipoPago(pagos);
    const payload: VentaInput = {
      cabecera: {
        total_pagado: total,
        monto_recibido: modoFiado ? total : montoRecibido,
        tipo_pago,
        id_usuario: idUsuario,
        pagos: modoFiado
          ? [{ medio_pago: 'credito', monto: total }]
          : pagos.length > 0
            ? pagos
            : [{ medio_pago: 'efectivo', monto: total }],
      },
      lineas: carrito.map((l) => ({
        codigo_barras: l.codigo_barras,
        cantidad: l.cantidad,
        precio_unitario: l.precio_unitario,
      })),
    };

    setProcesando(true);
    playCobrar();
    try {
      const respuesta = await window.api.ventas.registrar(payload);
      if (!respuesta.ok) {
        const offlineCheck = await window.api.offline.verificarConexion();
        if (offlineCheck.ok && !offlineCheck.data) {
          // Se vuelve pase lo que pase: si no se pudo guardar, `guardarOffline`
          // ya dejo el aviso en rojo, y el mensaje de abajo lo taparia con uno
          // menos urgente.
          await guardarOffline(payload);
          return;
        }
        setMensajeError(respuesta.mensaje);
        console.error('[VentaPOS.cobrar] respuesta de error:', respuesta);
        return;
      }
      const venta = respuesta.data.venta;

      if (modoFiado && clienteFiadoSel !== null) {
        const nombreCliente = clientesFiado.find((c) => c.id_cliente === clienteFiadoSel)?.nombre || '';
        const rf = await window.api.clientes.registrarCompraFiado(clienteFiadoSel, venta.id_venta, total);

        // La venta YA está registrada y el stock YA se descontó. Si la carga a
        // la cuenta corriente falla, el carrito se limpia igual: dejarlo puesto
        // invita a apretar Cobrar de nuevo y a duplicar la venta.
        //
        // Antes no se miraba el resultado --que es un `Resultado<T>`, no una
        // excepción--, así que un fallo acá se anunciaba como éxito y la deuda
        // no quedaba en ningún lado.
        resetearCarrito();
        setModoFiado(false);
        setClienteFiadoSel(null);

        if (!rf.ok) {
          playError();
          setMensajeError(
            `La venta ${venta.id_venta} quedó registrada, pero NO se cargó a la cuenta de ${nombreCliente}: ${rf.mensaje}. Anotala a mano en Cuenta corriente.`,
          );
          return;
        }
        setMensajeInfo(`Venta a crédito registrada para ${nombreCliente}`);
        return;
      }

      const datosTicket: DatosTicket = {
        id_venta: venta.id_venta,
        fecha_hora: venta.fecha_hora,
        total_pagado: venta.total_pagado,
        monto_recibido: venta.monto_recibido,
        vuelto: venta.vuelto,
        tipo_pago: venta.tipo_pago,
        lineas: carrito.map((l) => ({
          nombre: l.nombre,
          cantidad: l.cantidad,
          precio_unitario: l.precio_unitario,
        })),
        ivaPorTasa: Object.keys(ivaPorTasa).length > 0 ? ivaPorTasa : undefined,
      };
      setDatosTicketPreview(datosTicket);
      setErrorTicket('');
    } catch (err) {
      console.error('[VentaPOS.cobrar]', err);
      playError();
      const offlineCheck = await window.api.offline.verificarConexion();
      if (offlineCheck.ok && !offlineCheck.data) {
        await guardarOffline(payload);
        return;
      }
      setMensajeError('Error inesperado al registrar la venta.');
    } finally {
      setProcesando(false);
      refocarEscaneo();
    }
  }

  const hayCliente = razonSocial.trim() !== '' || rucCliente.trim() !== '';
  const clienteCredito = clienteSeleccionado;
  const dispCredito = clienteCredito ? creditoDisponible(clienteCredito) : 0;
  const subtotalBruto = carrito.reduce((a, l) => a + l.precio_unitario * l.cantidad, 0);
  const unidades = carrito.reduce((a, l) => a + l.cantidad, 0);

  // El teclado en pantalla escribe sobre el mismo campo que el teclado físico.
  // Es presentación, no cálculo: reformatea y delega en agregarPagoCustom().
  const digitosImporte = montoCustomTexto.replace(/\D/g, '');

  // Van con el actualizador funcional, no leyendo `montoCustomTexto` del
  // render: dos toques seguidos en una pantalla tactil pueden caer en el mismo
  // lote de React, y ahi el segundo pisaria al primero en vez de encadenarlo.
  const componerImporte = (transformar: (digitos: string) => string) =>
    setMontoCustomTexto((prev) => {
      const n = siguienteImporte(prev, transformar);
      return n > 0 ? formatearGs(n) : '';
    });

  const escribirImporte = (d: string) => componerImporte((dig) => dig + d);
  const borrarImporte = () => componerImporte((dig) => dig.slice(0, -1));

  // Los botones de denominacion suman sobre lo que ya hay, que es como se
  // cuenta plata en el mostrador: dos billetes de 50.000 son 100.000.
  const sumarImporte = (monto: number) =>
    componerImporte((dig) => String((parseInt(dig, 10) || 0) + monto));

  // Lo que quedaria si se agregara el importe en curso. Es proyeccion, no
  // estado: sirve para que el cajero vea el efecto antes de confirmar.
  const importeEnCurso = parseInt(digitosImporte, 10) || 0;
  const recibidoProyectado = montoRecibido + importeEnCurso;
  const faltaProyectado = Math.max(0, total - recibidoProyectado);
  const vueltoProyectado = Math.max(0, recibidoProyectado - total);

  const operaciones: Operacion[] = [
    {
      etiqueta: modoBascula ? 'Báscula ON' : 'Báscula',
      activo: modoBascula,
      onClick: () => {
        setModoBascula(!modoBascula);
        setPesoPendiente(null);
        setCodigoEscaneo('');
        setModoCantidad(false);
        refocarEscaneo();
      },
    },
    {
      etiqueta: mostrarBrowser ? 'Cerrar rubros' : 'Rubros',
      activo: mostrarBrowser,
      onClick: () => cargarProductosPorCategoria(mostrarBrowser ? null : (categorias[0]?.id_categoria ?? null)),
      desactivado: categorias.length === 0,
    },
    { etiqueta: 'Productos', onClick: () => setEditorAbierto(true) },
    {
      etiqueta: ventaRetenida ? 'Recuperar' : 'Retener',
      tecla: 'F7',
      tono: ventaRetenida ? 'alerta' : undefined,
      desactivado: !ventaRetenida && carrito.length === 0,
      onClick: () => {
        if (ventaRetenida) {
          setCarrito(ventaRetenida.carrito);
          setPagos(ventaRetenida.pagos);
          setVentaRetenida(null);
          setMensajeInfo('Venta retenida recuperada.');
        } else {
          setVentaRetenida({ carrito: [...carrito], pagos: [...pagos] });
          resetearCarritoSinMsg();
          setMensajeInfo('Venta retenida. F7 para recuperarla.');
        }
        refocarEscaneo();
      },
    },
    {
      etiqueta: 'Importe exacto',
      desactivado: procesando || total <= 0 || modoFiado,
      onClick: () => { agregarPago('efectivo', total); refocarEscaneo(); },
    },
    {
      etiqueta: 'Anular línea',
      tecla: 'F4',
      tono: 'peligro',
      desactivado: carrito.length === 0,
      onClick: () => {
        const idx = lineaSel >= 0 && lineaSel < carrito.length ? lineaSel : carrito.length - 1;
        if (idx < 0) return;
        const l = carrito[idx];
        quitarLinea(l.codigo_barras);
        setMensajeInfo(`Línea anulada: ${l.nombre}`);
      },
    },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col bg-ui-fondo text-ui-tx">
      <TituloModulo
        derecha={
          <>
            <span className="num border border-white/30 bg-black/20 px-1.5 py-px">CAJA {nroCaja}</span>
            <span>{nombreCajero}</span>
            <Semaforo
              estado={estadoImpresora === 'ok' ? 'ok' : estadoImpresora === 'consultando' ? 'espera' : 'mal'}
              texto="Ticketera"
              detalle={estadoImpresora === 'ok' ? 'Impresora configurada y visible' : 'Sin impresora configurada'}
            />
            <Semaforo
              estado={conectado ? 'ok' : 'mal'}
              texto="Supabase"
              detalle={conectado ? 'Conectado' : 'Sin conexión: las ventas quedan guardadas acá'}
            />
            {pendientes > 0 && <span className="num text-ui-inv">{pendientes} sin sincronizar</span>}
          </>
        }
      >
        Punto de venta
      </TituloModulo>

      {/* ── Cabecera del comprobante ── */}
      <div className="flex shrink-0 items-end gap-2 border-b border-ui-bdf bg-ui-barra px-2 py-1.5">
        <Campo rotulo="RUC / C.I." className="w-44">
          <input
            ref={inputRucRef}
            type="text"
            value={rucCliente}
            onChange={(e) => setRucCliente(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              e.preventDefault();
              const c = buscarClientePorRuc(rucCliente);
              if (c) { aplicarCliente(c); setMensajeInfo(`Cliente: ${c.nombre}`); }
              refocarEscaneo();
            }}
            placeholder="Sin identificar"
            autoComplete="off"
            spellCheck={false}
            className="ui-campo num"
          />
        </Campo>

        <Campo rotulo="Razón social / nombre del cliente" className="flex-1">
          <div className="relative">
            <input
              type="text"
              value={razonSocial}
              onChange={(e) => {
                const v = e.target.value;
                setRazonSocial(v);
                setClienteFiadoSel(null);
                setIndiceFiadoSel(-1);
                setResultadosFiado(buscarPorNombre(clientesFiado, v));
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setIndiceFiadoSel((p) => Math.min(p + 1, resultadosFiado.length - 1)); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setIndiceFiadoSel((p) => Math.max(p - 1, 0)); return; }
                if (e.key === 'Enter') {
                  e.preventDefault();
                  const c = resultadosFiado[indiceFiadoSel];
                  if (c) aplicarCliente(c); else setResultadosFiado([]);
                  refocarEscaneo();
                  return;
                }
                if (e.key === 'Escape') { setResultadosFiado([]); refocarEscaneo(); }
              }}
              placeholder="Consumidor final"
              autoComplete="off"
              spellCheck={false}
              className="ui-campo uppercase"
            />
            {resultadosFiado.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-30 max-h-56 overflow-y-auto border border-ui-bdf bg-ui-sup shadow-[0_8px_22px_rgba(0,0,0,0.30)]">
                {resultadosFiado.map((c, i) => (
                  <button
                    key={c.id_cliente}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); aplicarCliente(c); refocarEscaneo(); }}
                    className={`flex w-full items-baseline justify-between gap-3 px-2 py-[3px] text-left ${
                      i === indiceFiadoSel ? 'bg-ui-sel text-ui-inv' : 'hover:bg-ui-sels'
                    }`}
                  >
                    <span className="truncate text-[12px] font-semibold uppercase">{c.nombre}</span>
                    <span className="num shrink-0 text-[10.5px] opacity-75">
                      {c.ruc || 's/RUC'} · disp. {formatearGs(creditoDisponible(c))}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </Campo>

        {hayCliente && (
          <button
            type="button"
            onClick={() => { aplicarCliente(null); refocarEscaneo(); }}
            className="ui-boton"
            title="Quitar el cliente del comprobante"
          >
            Quitar
          </button>
        )}

        <Campo rotulo="Condición" className="w-[168px]">
          <div className="flex">
            {(['contado', 'credito'] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => cambiarCondicion(c)}
                className={`ui-boton flex-1 ${condicionVenta === c ? (c === 'credito' ? 'pel' : 'sel') : ''}`}
              >
                {c === 'contado' ? 'Contado' : 'Crédito'}
              </button>
            ))}
          </div>
        </Campo>
      </div>

      {/* ── Escaneo. Acá vive el foco. ── */}
      <div className="flex shrink-0 items-stretch border-b border-ui-bdf bg-ui-barra">
        <span className="flex w-44 shrink-0 items-center border-r border-ui-bd px-2 text-[10px] font-bold uppercase leading-tight tracking-wider text-ui-txs">
          Código de barras
          <br />o búsqueda
        </span>
        <div className="relative flex-1">
          <input
            id="escaneo"
            ref={inputEscaneoRef}
            type="text"
            value={codigoEscaneo}
            onChange={(e) => {
              const raw = e.target.value;
              const soloDigitos = raw.replace(/\D/g, '');
              const v = (modoCantidad || modoBascula) ? soloDigitos : raw;
              setCodigoEscaneo(v);

              if (!modoCantidad && !modoBascula && /[a-zA-ZáéíóúÁÉÍÓÚñÑ]/.test(v) && v.length >= 2) {
                if (timeoutBusqueda.current) clearTimeout(timeoutBusqueda.current);
                timeoutBusqueda.current = setTimeout(async () => {
                  const r = await window.api.productos.buscar(v);
                  if (r.ok) {
                    setSugerencias(r.data);
                    setDropdownAbierto(r.data.length > 0);
                    setIndiceSeleccionado(-1);
                  }
                }, 150);
              } else {
                setDropdownAbierto(false);
                setSugerencias([]);
              }
            }}
            onKeyDown={(e) => {
              if (dropdownAbierto) {
                if (e.key === 'ArrowDown') { e.preventDefault(); setIndiceSeleccionado((p) => Math.min(p + 1, sugerencias.length - 1)); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setIndiceSeleccionado((p) => Math.max(p - 1, 0)); return; }
                if (e.key === 'Enter' && indiceSeleccionado >= 0) {
                  e.preventDefault();
                  const p = sugerencias[indiceSeleccionado];
                  if (p) { agregarAlCarrito(p); }
                  setCodigoEscaneo('');
                  setDropdownAbierto(false);
                  setSugerencias([]);
                  return;
                }
                if (e.key === 'Escape') { setDropdownAbierto(false); setSugerencias([]); return; }
              } else if (carrito.length > 0 && codigoEscaneo === '') {
                // Con el campo vacío y el desplegable cerrado, las flechas
                // mueven la línea seleccionada: es sobre la que caen F3 y F4.
                if (e.key === 'ArrowDown') { e.preventDefault(); setLineaSel((p) => Math.min(p + 1, carrito.length - 1)); return; }
                if (e.key === 'ArrowUp') { e.preventDefault(); setLineaSel((p) => Math.max(p - 1, 0)); return; }
              }
              manejarEscaneo(e);
            }}
            disabled={procesando}
            autoComplete="off"
            spellCheck={false}
            placeholder={modoCantidad ? 'Cantidad + Enter' : modoBascula ? 'Peso en gramos + Enter' : 'Escaneá o escribí para buscar'}
            className={`ui-campo ui-escaneo num !border-0 ${
              modoCantidad ? 'bg-ui-ales text-ui-ale' : modoBascula ? 'bg-ui-infs text-ui-inf' : ''
            }`}
          />

          {dropdownAbierto && sugerencias.length > 0 && (
            <div ref={dropdownRef} className="absolute left-0 right-0 top-full z-30 max-h-72 overflow-y-auto border border-ui-bdf bg-ui-sup shadow-[0_8px_22px_rgba(0,0,0,0.30)]">
              {sugerencias.map((p, i) => (
                <button
                  key={p.codigo_barras}
                  type="button"
                  className={`flex w-full items-baseline gap-3 px-2 py-[3px] text-left ${
                    i === indiceSeleccionado ? 'bg-ui-sel text-ui-inv' : 'hover:bg-ui-sels'
                  }`}
                  onMouseDown={(e) => { e.preventDefault(); agregarAlCarrito(p); setCodigoEscaneo(''); setDropdownAbierto(false); setSugerencias([]); }}
                >
                  <span className="num w-32 shrink-0 text-[11px] opacity-70">{p.codigo_barras}</span>
                  <span className="min-w-0 flex-1 truncate text-[12.5px]">{p.nombre}</span>
                  <span className="num shrink-0 text-[12.5px] font-bold">{formatearGs(p.precio_venta)}</span>
                  <span className="num w-14 shrink-0 text-right text-[11px] opacity-70">stk {p.stock}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="flex w-[168px] shrink-0 items-center justify-end gap-2 border-l border-ui-bd px-2">
          {modoBascula && <span className="num bg-ui-inf px-1.5 py-px text-[10.5px] font-bold text-white">BÁSCULA</span>}
          {pesoPendiente !== null && (
            <span className="num bg-ui-inf px-1.5 py-px text-[11px] font-bold text-white">{pesoPendiente.toFixed(3)} kg</span>
          )}
          {modoCantidad && <span className="num bg-ui-ale px-1.5 py-px text-[10.5px] font-bold text-white">CANTIDAD ×</span>}
        </div>
      </div>

      {/* ── Cuerpo: comprobante a la izquierda, cobro a la derecha ── */}
      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col border-r border-ui-bdf">
          {mostrarBrowser && (
            <div className="shrink-0 border-b border-ui-bdf bg-ui-barra">
              <div className="flex items-center gap-1 overflow-x-auto px-1.5 py-1">
                {categorias.map((c) => (
                  <button
                    key={c.id_categoria}
                    type="button"
                    onClick={() => cargarProductosPorCategoria(c.id_categoria)}
                    className={`ui-boton !min-h-[22px] !px-2 !text-[11px] ${catSeleccionada === c.id_categoria ? 'sel' : ''}`}
                  >
                    {c.nombre}
                  </button>
                ))}
              </div>
              <div className="max-h-40 overflow-y-auto border-t border-ui-bd">
                {catCargando ? (
                  <Vacio>Cargando…</Vacio>
                ) : productosPorCat.length === 0 ? (
                  <Vacio>Sin productos en este rubro</Vacio>
                ) : (
                  <div className="ui-ops" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(132px, 1fr))' }}>
                    {productosPorCat.map((p) => (
                      <button
                        key={p.codigo_barras}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); agregarAlCarrito(p); setCodigoEscaneo(''); }}
                        className="!items-start !text-left"
                      >
                        <span className="line-clamp-2 w-full leading-tight">{p.nombre}</span>
                        <span className="num w-full text-[12px] font-bold">{formatearGs(p.precio_venta)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto bg-ui-sup">
            {carrito.length === 0 ? (
              <Vacio>Escaneá un producto para comenzar la venta</Vacio>
            ) : (
              <table className="ui-grilla">
                <thead>
                  <tr>
                    <th className="w-11 cen">Ítem</th>
                    <th className="w-36">Código EAN</th>
                    <th>Descripción del producto</th>
                    <th className="w-[52px] cen">IVA</th>
                    <th className="w-20 der">Cant.</th>
                    <th className="w-28 der">P. unitario</th>
                    <th className="w-24 der">Desc.</th>
                    <th className="w-32 der">Subtotal</th>
                    <th className="w-[74px]"></th>
                  </tr>
                </thead>
                <tbody>
                  {carrito.map((linea, idx) => {
                    const desc = descuentoLinea(linea);
                    const subtotal = linea.precio_unitario * linea.cantidad - desc;
                    return (
                      <tr
                        key={linea.codigo_barras}
                        onClick={() => { setLineaSel(idx); refocarEscaneo(); }}
                        className={idx === lineaSel ? 'sel' : ''}
                      >
                        <td className="num text-center text-ui-txt">{String(idx + 1).padStart(2, '0')}</td>
                        <td className="num text-ui-txs">{linea.codigo_barras}</td>
                        <td className="max-w-0">
                          <span className="block truncate">
                            {linea.nombre}
                            {linea.envase && linea.envase.trajo && (
                              <span className="ml-2 text-[10.5px] font-bold uppercase tracking-wide text-ui-inf">
                                {linea.envase.nombre} devuelto
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="num text-center text-[11px] text-ui-txt">
                          {linea.iva === 0 ? 'EXE' : `${linea.iva}%`}
                        </td>
                        <td className="num text-right font-bold">
                          {linea.cantidad % 1 === 0 ? linea.cantidad : linea.cantidad.toFixed(3)}
                        </td>
                        <td className="num text-right">{formatearGs(linea.precio_unitario)}</td>
                        <td className={`num text-right ${desc > 0 ? 'text-ui-inf' : 'text-ui-txt'}`}>
                          {desc > 0 ? `-${formatearGs(desc)}` : '—'}
                        </td>
                        <td className="num text-right font-bold">{formatearGs(subtotal)}</td>
                        <td className="!p-0">
                          <div className="flex items-stretch justify-end">
                            <CeldaBoton titulo="Restar uno" onClick={() => cambiarCantidad(linea.codigo_barras, -1)}>−</CeldaBoton>
                            <CeldaBoton titulo="Sumar uno" onClick={() => cambiarCantidad(linea.codigo_barras, +1)}>+</CeldaBoton>
                            {envasesList.length > 0 && (
                              <CeldaBoton
                                titulo={linea.envase ? 'Quitar el envase devuelto' : 'Marcar envase devuelto'}
                                onClick={() => {
                                  setCarrito((prev) => {
                                    const i = prev.findIndex((l) => l.codigo_barras === linea.codigo_barras);
                                    if (i === -1) return prev;
                                    const copia = [...prev];
                                    const l = copia[i];
                                    if (l.envase) {
                                      const act = { ...l };
                                      delete act.envase;
                                      copia[i] = act;
                                    } else {
                                      const env = envasesList[0];
                                      copia[i] = { ...l, envase: { id_envase: env.id_envase, nombre: env.nombre, precio: env.precio, trajo: true } };
                                    }
                                    return copia;
                                  });
                                  refocarEscaneo();
                                }}
                              >
                                E
                              </CeldaBoton>
                            )}
                            <CeldaBoton titulo={`Anular ${linea.nombre}`} onClick={() => quitarLinea(linea.codigo_barras)} peligro>×</CeldaBoton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {(mensajeError || mensajeInfo) && (
            <div className="shrink-0 border-t border-ui-bd">
              <Aviso tono={mensajeError ? 'peligro' : mensajeInfo?.includes('sin conexión') ? 'alerta' : 'ok'}>
                {mensajeError ?? mensajeInfo}
              </Aviso>
            </div>
          )}
        </section>

        {/* ── Columna de cobro ── */}
        <aside className="flex w-[336px] shrink-0 flex-col gap-2.5 overflow-y-auto p-2">
          <Caja titulo="Cliente" cuerpoClassName="p-1.5">
            {clienteCredito ? (
              <div className="space-y-0.5">
                <div className="truncate text-[12.5px] font-bold uppercase">{clienteCredito.nombre}</div>
                <Fila etiqueta="Límite" valor={formatearGs(clienteCredito.limite_credito)} />
                <Fila etiqueta="Deuda" valor={formatearGs(clienteCredito.saldo_deudor)} />
                <Fila
                  etiqueta="Disponible"
                  valor={formatearGs(dispCredito)}
                  fuerte
                  tono={!modoFiado ? undefined : dispCredito >= total ? 'ok' : 'peligro'}
                />
                {modoFiado && dispCredito < total && (
                  <div className="pt-1"><Aviso tono="peligro">Supera el límite de crédito</Aviso></div>
                )}
              </div>
            ) : (
              <p className="text-[12px] text-ui-txt">
                {razonSocial.trim() ? razonSocial : 'Consumidor final'}
                {modoFiado && (
                  <span className="mt-1 block text-ui-pel">
                    La venta a crédito necesita un cliente. Buscalo con <Tecla>F1</Tecla>.
                  </span>
                )}
              </p>
            )}

            {modoFiado && !clienteCredito && razonSocial.trim() && resultadosFiado.length === 0 && !showCrearCliente && (
              <button
                type="button"
                onClick={() => { setNuevoClienteNombre(razonSocial.trim()); setNuevoClienteRuc(rucCliente.trim()); setShowCrearCliente(true); }}
                className="ui-boton mt-1.5 w-full"
              >
                Dar de alta «{razonSocial.trim()}»
              </button>
            )}
          </Caja>

          <Caja titulo="Totales" cuerpoClassName="p-1.5">
            <Fila etiqueta={`Ítems (${carrito.length})`} valor={unidades % 1 === 0 ? unidades : unidades.toFixed(3)} />
            <Fila etiqueta="Bruto" valor={formatearGs(subtotalBruto)} />
            {descuentoTotal > 0 && <Fila etiqueta="Descuentos" valor={`-${formatearGs(descuentoTotal)}`} tono="info" />}
            <div className="my-1 border-t border-ui-bd" />
            <Fila etiqueta="IVA incluido" valor={formatearGs(ivaTotal)} />
          </Caja>

          {!modoFiado && (
            <Caja titulo="Cobro" cuerpoClassName="p-1.5">
              <div className="mb-1.5 max-h-24 overflow-y-auto">
                {pagos.length === 0 ? (
                  <p className="text-[11.5px] italic text-ui-txt">Sin pagos registrados</p>
                ) : (
                  pagos.map((p, idx) => (
                    <div key={idx} className="flex items-center gap-1 border-b border-ui-bd py-[2px] last:border-b-0">
                      <span className="w-20 shrink-0 truncate text-[11.5px] capitalize text-ui-txs">{p.medio_pago}</span>
                      <span className="num flex-1 text-right text-[12.5px] font-bold">{formatearGs(p.monto)}</span>
                      <button
                        type="button"
                        onClick={() => eliminarPago(idx)}
                        aria-label="Quitar pago"
                        className="px-1 text-[13px] leading-none text-ui-txt hover:text-ui-pel"
                      >
                        ×
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="mb-1.5">
                <select
                  value={medioPagoSel}
                  onChange={(e) => setMedioPagoSel(e.target.value as MedioPagoManual)}
                  disabled={procesando}
                  className="ui-campo w-full"
                >
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>

              {/* Visor del importe que se esta componiendo. Es el campo de
                  verdad, no un espejo: el teclado fisico escribe aca y el de
                  pantalla tambien, asi que lo que se ve es siempre lo que se
                  va a agregar. Antes era un campo angosto al lado del
                  selector y el cajero no tenia a la vista lo que marcaba. */}
              <div className="mb-1.5 border border-ui-bdf bg-ui-hund px-1.5 py-1">
                <div className="flex items-baseline justify-between">
                  <span className="text-[9.5px] font-bold uppercase tracking-wider text-ui-txt">
                    Importe · {ETIQUETA_MEDIO[medioPagoSel]}
                  </span>
                  <span className="text-[9.5px] font-bold uppercase tracking-wider text-ui-txt">Gs.</span>
                </div>
                <input
                  type="text"
                  value={montoCustomTexto}
                  onChange={(e) => {
                    const input = e.target;
                    const pos = input.selectionStart ?? 0;
                    const soloDigitos = input.value.replace(/\D/g, '');
                    if (soloDigitos === '') { setMontoCustomTexto(''); return; }
                    const n = parseInt(soloDigitos, 10);
                    if (!Number.isFinite(n)) return;
                    const digitosAntesCursor = (input.value.slice(0, pos).match(/\d/g) || []).length;
                    const formateado = formatearGs(n);
                    setMontoCustomTexto(formateado);
                    let digitosVistos = 0;
                    let nuevaPos = formateado.length;
                    for (let i = 0; i < formateado.length; i++) {
                      if (digitosVistos >= digitosAntesCursor) { nuevaPos = i; break; }
                      if (/\d/.test(formateado[i])) digitosVistos++;
                    }
                    queueMicrotask(() => input.setSelectionRange(nuevaPos, nuevaPos));
                  }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarPagoCustom(); refocarEscaneo(); } }}
                  placeholder="0"
                  disabled={procesando}
                  aria-label={`Importe a cobrar con ${ETIQUETA_MEDIO[medioPagoSel]}`}
                  className="num w-full border-0 bg-transparent p-0 text-right text-[26px] font-bold leading-tight text-ui-tx outline-none placeholder:text-ui-txt"
                />
                {total > 0 && (
                  <div className="mt-0.5 flex justify-between border-t border-ui-bd pt-0.5 text-[10.5px]">
                    {faltaProyectado > 0 ? (
                      <>
                        <span className="font-bold uppercase tracking-wide text-ui-txt">Falta</span>
                        <span className="num font-bold text-ui-pel">{formatearGs(faltaProyectado)}</span>
                      </>
                    ) : (
                      <>
                        <span className="font-bold uppercase tracking-wide text-ui-txt">Vuelto</span>
                        <span className="num font-bold text-ui-ok">{formatearGs(vueltoProyectado)}</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Las denominaciones cargan el visor en vez de registrar el pago
                  de una: suman, y respetan el medio de pago elegido. Antes
                  forzaban efectivo y el importe no se veia en ningun lado. */}
              <div className="mb-1.5 grid grid-cols-3 gap-1">
                {DENOMINACIONES_RAPIDAS.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => { sumarImporte(d); refocarEscaneo(); }}
                    disabled={procesando}
                    className="ui-boton num !px-1 !text-[11.5px]"
                    title={`Sumar ${formatearGs(d)} al importe`}
                  >
                    {formatearGs(d)}
                  </button>
                ))}
              </div>

              <TecladoNumerico
                onTecla={escribirImporte}
                onBorrar={borrarImporte}
                onLimpiar={() => setMontoCustomTexto('')}
                className="mb-1.5"
              />

              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => { agregarPagoCustom(); refocarEscaneo(); }}
                  disabled={procesando || digitosImporte === '' || parseInt(digitosImporte, 10) <= 0}
                  className="ui-boton sel flex-1"
                >
                  Agregar pago
                </button>
                <button
                  type="button"
                  onClick={() => { setPagos([]); refocarEscaneo(); }}
                  disabled={procesando || pagos.length === 0}
                  className="ui-boton"
                >
                  Limpiar
                </button>
              </div>
            </Caja>
          )}

          <Caja titulo="Operaciones" cuerpoClassName="p-1.5">
            <GrillaOps ops={operaciones} columnas={3} />
          </Caja>

          <div className="mt-auto flex flex-col gap-1 pt-1">
            <button
              type="button"
              onClick={cobrar}
              disabled={procesando || carrito.length === 0 || (!modoFiado && montoRecibido < total)}
              className="ui-boton pri !min-h-[46px] !text-[19px] !tracking-wide"
            >
              {procesando ? 'PROCESANDO…' : <>COBRAR <Tecla>F12</Tecla></>}
            </button>
            <button
              type="button"
              onClick={() => { if (carrito.length > 0) setConfirmandoCancelar(true); else resetearCarrito(); }}
              disabled={procesando}
              className="ui-boton"
            >
              Cancelar venta <Tecla>ESC</Tecla>
            </button>
          </div>
        </aside>
      </div>

      {/* ── Pie fiscal e importes ── */}
      <div className="flex shrink-0 items-stretch border-t-2 border-ui-bdf bg-ui-barra">
        <div className="flex items-stretch">
          <Casillero etiqueta="Exentas" valor={basePorTasa.exentas} />
          <Casillero etiqueta="Gravadas 5%" valor={basePorTasa.cinco} />
          <Casillero etiqueta="Gravadas 10%" valor={basePorTasa.diez} />
          <Casillero etiqueta="Total IVA" valor={ivaTotal} destacado />
        </div>

        <div className="flex flex-1 items-stretch justify-end">
          {!modoFiado && (
            <>
              <Importe etiqueta="Recibido" valor={montoRecibido} />
              <Importe
                etiqueta={faltante > 0 ? 'Falta' : 'Vuelto'}
                valor={faltante > 0 ? faltante : vuelto}
                tono={faltante > 0 ? 'peligro' : vuelto > 0 ? 'ok' : undefined}
              />
            </>
          )}
          <div className="flex min-w-[326px] items-center justify-between gap-4 border-l-2 border-ui-bdf bg-ui-sel px-3 py-1.5 text-ui-inv">
            <span className="text-[11px] font-bold uppercase leading-tight tracking-wider text-white/70">
              Total a<br />pagar (Gs.)
            </span>
            <span className="num text-[42px] font-bold leading-none tracking-tight">{formatearGs(total)}</span>
          </div>
        </div>
      </div>

      {/* ── Diálogos ── */}
      {showCrearCliente && (
        <Modal
          titulo="Alta de cliente en cuenta corriente"
          ancho="w-[420px]"
          onCerrar={() => setShowCrearCliente(false)}
          pie={
            <>
              <button type="button" onClick={() => setShowCrearCliente(false)} className="ui-boton">Cancelar</button>
              <button
                type="button"
                disabled={!nuevoClienteNombre.trim()}
                onClick={async () => {
                  if (!nuevoClienteNombre.trim()) return;
                  const limite = parseInt(nuevoClienteLimite.replace(/\./g, '')) || 0;
                  const r = await window.api.clientes.crear({
                    nombre: nuevoClienteNombre.trim(),
                    ruc: nuevoClienteRuc.trim() || undefined,
                    telefono: nuevoClienteTel.trim() || undefined,
                    limite_credito: limite,
                  });
                  if (!r.ok) { setMensajeError(r.mensaje); return; }
                  await cargarClientesFiado();
                  aplicarCliente({
                    id_cliente: r.data.id_cliente,
                    nombre: r.data.nombre,
                    ruc: nuevoClienteRuc.trim() || null,
                    telefono: nuevoClienteTel.trim() || null,
                    direccion: null,
                    limite_credito: limite,
                    saldo_deudor: 0,
                    activo: true,
                  });
                  setShowCrearCliente(false);
                  setNuevoClienteNombre(''); setNuevoClienteRuc(''); setNuevoClienteTel(''); setNuevoClienteLimite('');
                }}
                className="ui-boton sel"
              >
                Dar de alta
              </button>
            </>
          }
        >
          <div className="space-y-2 p-3">
            <Campo rotulo="Nombre o razón social *">
              <input type="text" value={nuevoClienteNombre} onChange={(e) => setNuevoClienteNombre(e.target.value)} className="ui-campo uppercase" />
            </Campo>
            <div className="flex gap-2">
              <Campo rotulo="RUC / C.I." className="flex-1">
                <input type="text" value={nuevoClienteRuc} onChange={(e) => setNuevoClienteRuc(e.target.value)} className="ui-campo num" />
              </Campo>
              <Campo rotulo="Teléfono" className="flex-1">
                <input type="text" value={nuevoClienteTel} onChange={(e) => setNuevoClienteTel(e.target.value)} className="ui-campo num" />
              </Campo>
            </div>
            <Campo rotulo="Límite de crédito (Gs.)">
              <input
                type="text"
                value={nuevoClienteLimite}
                onChange={(e) => setNuevoClienteLimite(e.target.value.replace(/[^\d]/g, ''))}
                className="ui-campo num text-right"
              />
            </Campo>
          </div>
        </Modal>
      )}

      {confirmandoCancelar && (
        <Modal
          titulo="Cancelar la venta en curso"
          ancho="w-[400px]"
          onCerrar={() => { setConfirmandoCancelar(false); refocarEscaneo(); }}
          pie={
            <>
              <button type="button" onClick={() => { setConfirmandoCancelar(false); refocarEscaneo(); }} className="ui-boton">
                No, volver
              </button>
              <button type="button" onClick={() => { setConfirmandoCancelar(false); resetearCarrito(); }} className="ui-boton pel">
                Sí, cancelar
              </button>
            </>
          }
        >
          <p className="p-4 text-[13px] leading-relaxed">
            Se descartan los <b className="num">{carrito.length}</b> ítems del carrito por{' '}
            <b className="num">{formatearGsConPrefijo(total)}</b>. No se puede deshacer.
          </p>
        </Modal>
      )}

      {datosTicketPreview && (
        <Modal
          titulo={`Venta registrada · N.º ${String(datosTicketPreview.id_venta).padStart(7, '0')}`}
          ancho="w-[420px]"
          onCerrar={() => { setDatosTicketPreview(null); resetearCarrito(); }}
          pie={
            <>
              <button
                type="button"
                onClick={() => { setDatosTicketPreview(null); resetearCarrito(); }}
                className="ui-boton"
              >
                No imprimir
              </button>
              <button
                type="button"
                onClick={async () => {
                  const r = await window.api.ticket.imprimir(datosTicketPreview);
                  if (!r.ok) { setErrorTicket(r.mensaje ?? 'Error al imprimir'); return; }
                  setDatosTicketPreview(null);
                  resetearCarrito();
                }}
                className="ui-boton pri"
              >
                Imprimir ticket
              </button>
            </>
          }
        >
          {errorTicket && <div className="p-2"><Aviso tono="peligro">{errorTicket}</Aviso></div>}
          <div className="bg-ui-hund px-4 py-3">
            <div className="mx-auto w-[290px] bg-[#f7f4ec] px-4 py-3 font-mono text-[12px] leading-snug text-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.25)]">
              <div className="border-b border-dashed border-gray-400 pb-2 text-center">
                <div className="text-[14px] font-bold tracking-wide">{comercio.nombre}</div>
                <div className="text-[11px] text-gray-600">{rucLinea}</div>
              </div>
              <div className="space-y-0.5 border-b border-dashed border-gray-400 py-2 text-[11px]">
                <div className="flex justify-between"><span>Ticket</span><span>{String(datosTicketPreview.id_venta).padStart(7, '0')}</span></div>
                <div className="flex justify-between">
                  <span>Fecha</span>
                  <span>{new Date(datosTicketPreview.fecha_hora).toLocaleString('es-PY', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })}</span>
                </div>
                <div className="flex justify-between"><span>Pago</span><span>{datosTicketPreview.tipo_pago}</span></div>
              </div>
              <div className="border-b border-dashed border-gray-400 py-2">
                <div className="flex pb-1 text-[10px] font-bold uppercase tracking-wider text-gray-600">
                  <span className="flex-1">Artículo</span>
                  <span className="w-10 text-right">Cant</span>
                  <span className="w-20 text-right">Precio</span>
                </div>
                {datosTicketPreview.lineas.map((l, i) => (
                  <div key={i} className="flex">
                    <span className="flex-1 truncate">{l.nombre.slice(0, 20)}</span>
                    <span className="w-10 text-right tabular-nums">{l.cantidad}</span>
                    <span className="w-20 text-right tabular-nums">{formatearGs(l.precio_unitario)}</span>
                  </div>
                ))}
              </div>
              <div className="space-y-0.5 py-2">
                <div className="flex justify-between text-[15px] font-bold">
                  <span>TOTAL</span>
                  <span className="tabular-nums">{formatearGs(datosTicketPreview.total_pagado)}</span>
                </div>
                {datosTicketPreview.ivaPorTasa && Object.keys(datosTicketPreview.ivaPorTasa).length > 0 && (
                  <div className="space-y-0.5 border-t border-gray-300 pt-1 text-[11px] text-gray-600">
                    {Object.entries(datosTicketPreview.ivaPorTasa).map(([tasa, monto]) => (
                      <div key={tasa} className="flex justify-between">
                        <span>IVA {tasa}%</span>
                        <span className="tabular-nums">{formatearGs(monto)}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-between pt-1"><span>Recibido</span><span className="tabular-nums">{formatearGs(datosTicketPreview.monto_recibido)}</span></div>
                <div className="flex justify-between font-bold"><span>Vuelto</span><span className="tabular-nums">{formatearGs(datosTicketPreview.vuelto)}</span></div>
              </div>
              <div className="border-t border-dashed border-gray-400 pt-2 text-center text-[11px] text-gray-600">
                ¡Gracias por su compra!
              </div>
            </div>
          </div>
        </Modal>
      )}

      {editorAbierto && (
        <ProductEditorModal
          onCerrar={() => { setEditorAbierto(false); setCodigoCrearProducto(null); }}
          codigoInicial={codigoCrearProducto ?? undefined}
        />
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════
   Piezas propias de la caja. Sin lógica de negocio.
   ══════════════════════════════════════════════════════════════════════════ */

/** Botón que vive dentro de una celda de la grilla: 18px, sin margen. */
function CeldaBoton({ children, onClick, titulo, peligro }: {
  children: ReactNode;
  onClick: () => void;
  titulo: string;
  peligro?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      title={titulo}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className={`h-[18px] w-[18px] border border-ui-bd bg-ui-sup text-[12px] font-bold leading-none text-ui-txs ${
        peligro ? 'hover:border-ui-pel hover:bg-ui-pel hover:text-white' : 'hover:bg-ui-alta'
      }`}
    >
      {children}
    </button>
  );
}

/** Casillero del desglose SET/DNIT. Ancho fijo para que no baile al tipear. */
function Casillero({ etiqueta, valor, destacado }: { etiqueta: string; valor: number; destacado?: boolean }): JSX.Element {
  return (
    <div className={`w-[126px] border-r border-ui-bd px-2 py-1 ${destacado ? 'bg-ui-sup' : ''}`}>
      <div className="text-[9.5px] font-bold uppercase tracking-wider text-ui-txt">{etiqueta}</div>
      <div className={`num text-right text-[14px] leading-tight ${destacado ? 'font-bold text-ui-tx' : 'text-ui-txs'}`}>
        {formatearGs(valor)}
      </div>
    </div>
  );
}

/** Importe grande del pie: recibido, vuelto, falta. */
function Importe({ etiqueta, valor, tono }: { etiqueta: string; valor: number; tono?: 'ok' | 'peligro' }): JSX.Element {
  const tinta = tono === 'ok' ? 'text-ui-ok' : tono === 'peligro' ? 'text-ui-pel' : 'text-ui-txs';
  return (
    <div className="flex min-w-[136px] flex-col justify-center border-l border-ui-bd px-3 py-1">
      <div className="text-[9.5px] font-bold uppercase tracking-wider text-ui-txt">{etiqueta}</div>
      <div className={`num text-right text-[21px] font-bold leading-none ${tinta}`}>{formatearGs(valor)}</div>
    </div>
  );
}
