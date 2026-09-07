// El ticket: la vista previa de la venta recién cobrada, el error de impresión
// y si la ticketera está donde debería.
//
// ── POR QUÉ VIVE ACÁ Y NO EN VentaPOS ──────────────────────────────────────
//
// Son tres estados que solo se tocan entre ellos y una consulta al arranque.
// El semáforo de la impresora se averigua **sin imprimir nada**:
// `listarImpresoras` ya devuelve cuál está elegida, así que alcanza con ver si
// Windows la sigue viendo. Preguntarlo imprimiendo una prueba gastaría papel
// en cada arranque de la caja.
//
// Lo que arma los bytes del ticket no está acá ni cambia: `construirTicket()`
// vive en el proceso main y la regla de oro no lo deja tocar.

import { useEffect, useState } from 'react';
import type { DatosTicket } from '../../shared/types/ventas';

export type EstadoImpresora = 'ok' | 'sin-config' | 'consultando';

export function useTicket() {
  /** La venta recién cobrada, mientras se muestra la vista previa. */
  const [datosTicketPreview, setDatosTicketPreview] = useState<DatosTicket | null>(null);
  const [errorTicket, setErrorTicket] = useState('');
  const [estadoImpresora, setEstadoImpresora] = useState<EstadoImpresora>('consultando');

  useEffect(() => {
    // Estado de la ticketera: hay impresora elegida y Windows la sigue viendo.
    // No imprime nada para averiguarlo; listarImpresoras ya devuelve la actual.
    window.api.config.listarImpresoras().then((r) => {
      if (!r.ok) { setEstadoImpresora('sin-config'); return; }
      const { impresoras, actual } = r.data;
      setEstadoImpresora(actual && impresoras.includes(actual) ? 'ok' : 'sin-config');
    }).catch(() => setEstadoImpresora('sin-config'));
  }, []);

  return {
    datosTicketPreview, setDatosTicketPreview,
    errorTicket, setErrorTicket,
    estadoImpresora,
  };
}
