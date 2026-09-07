// El estado de la venta a crédito: el modo fiado, el cliente elegido, su
// búsqueda y el alta rápida desde el mostrador.
//
// ── POR QUÉ VIVE ACÁ Y NO EN VentaPOS ──────────────────────────────────────
//
// Doce `useState` de los cuarenta y uno que tenía la pantalla, más las cuatro
// operaciones que los mueven juntos. Es el bloque más autocontenido de
// `VentaPOS`: no toca el escaneo, ni la ticketera, ni la carga de productos
// --las tres cosas que la regla de oro de la auditoría no deja romper--, así
// que es por donde conviene empezar a partir el archivo.
//
// La cabecera fiscal (RUC y razón social) viene junto al panel de crédito a
// propósito: los dos miran el mismo cliente, y elegirlo de un lado tiene que
// verse del otro. Separarlos fue lo que hacía que la cabecera dijera una cosa
// y el panel otra.
//
// El hook devuelve los nombres tal cual los usaba la pantalla, para que la
// extracción no toque una sola línea del JSX.

import { useState } from 'react';
import type { ClienteFiado } from '../../shared/types/ventas';
import { buscarPorRuc } from '../../shared/clientes/fiado';

/** Cómo se cobra la venta, en el vocabulario del SET. */
export type CondicionVenta = 'contado' | 'credito';

export function useFiado() {
  const [modoFiado, setModoFiado] = useState(false);
  const [clienteFiadoSel, setClienteFiadoSel] = useState<number | null>(null);
  const [clientesFiado, setClientesFiado] = useState<ClienteFiado[]>([]);
  const [resultadosFiado, setResultadosFiado] = useState<ClienteFiado[]>([]);
  const [indiceFiadoSel, setIndiceFiadoSel] = useState(-1);
  const [showCrearCliente, setShowCrearCliente] = useState(false);
  const [nuevoClienteNombre, setNuevoClienteNombre] = useState('');
  const [nuevoClienteRuc, setNuevoClienteRuc] = useState('');
  const [nuevoClienteTel, setNuevoClienteTel] = useState('');
  const [nuevoClienteLimite, setNuevoClienteLimite] = useState('');

  // Cabecera fiscal del comprobante. Una factura al contado tambien lleva RUC
  // y razon social, asi que no son exclusivos del fiado.
  const [rucCliente, setRucCliente] = useState('');
  const [razonSocial, setRazonSocial] = useState('');

  async function cargarClientesFiado() {
    const r = await window.api.clientes.listar();
    if (r.ok) setClientesFiado(r.data);
  }

  // Solo cambia la condicion de la venta. El cliente elegido sobrevive al
  // cambio a proposito: una factura al contado tambien lleva RUC y razon
  // social, y volver a credito no deberia obligar a buscarlo de nuevo. Para
  // sacarlo esta el boton de quitar, en la cabecera.
  function toggleFiado() {
    if (modoFiado) {
      setModoFiado(false);
      setResultadosFiado([]);
      setShowCrearCliente(false);
    } else {
      cargarClientesFiado();
      setModoFiado(true);
    }
  }

  // La condicion de venta no es estado propio: es la misma cosa que el modo
  // fiado, mirada desde el vocabulario del SET. Derivarla evita que la cabecera
  // diga "contado" mientras el panel de la derecha esta fiando.
  const condicionVenta: CondicionVenta = modoFiado ? 'credito' : 'contado';

  // La cabecera fiscal y el panel de credito miran el mismo cliente: elegirlo
  // de un lado tiene que verse del otro.
  function aplicarCliente(c: ClienteFiado | null) {
    setClienteFiadoSel(c ? c.id_cliente : null);
    setRucCliente(c?.ruc ?? '');
    setRazonSocial(c?.nombre ?? '');
    setResultadosFiado([]);
    setIndiceFiadoSel(-1);
  }

  /** Busca por RUC sobre la lista de clientes ya cargada. */
  function buscarClientePorRuc(ruc: string): ClienteFiado | undefined {
    return buscarPorRuc(clientesFiado, ruc);
  }

  // El cliente al que se le fia, resuelto una sola vez. Estaba buscado por
  // separado en la validacion de cobrar() y en el panel de credito.
  const clienteSeleccionado = clientesFiado.find((c) => c.id_cliente === clienteFiadoSel);

  return {
    modoFiado, setModoFiado,
    clienteFiadoSel, setClienteFiadoSel,
    clientesFiado, setClientesFiado,
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
  };
}
