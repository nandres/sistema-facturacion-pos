// Lo que el cliente entrega: los pagos cargados, el medio elegido y el visor
// del importe en curso.
//
// ── POR QUÉ VIVE ACÁ Y NO EN VentaPOS ──────────────────────────────────────
//
// La aritmética ya salió a `shared/calculos/pagos.ts`, que es la parte que se
// puede probar sin montar la pantalla. Lo que queda acá es el estado de React
// alrededor de esa aritmética: qué se cobró, con qué medio, y qué está tipeando
// el cajero en el teclado numérico.
//
// `total` entra como parámetro porque lo pone el carrito: los pagos no saben
// sumar productos, solo comparan contra lo que hay que cobrar.
//
// El hook devuelve los mismos nombres que usaba la pantalla, para que la
// extracción no toque una sola línea del JSX.

import { useMemo, useState } from 'react';
import type { MedioPago, MedioPagoManual, PagoInput } from '../../shared/types/ventas';
import { sumarPagos, calcularVuelto, calcularFaltante, siguienteImporte } from '../../shared/calculos/pagos';
import { formatearGs } from '../../shared/formato/guarani';

export function usePagos(total: number) {
  const [pagos, setPagos] = useState<PagoInput[]>([]);
  const [medioPagoSel, setMedioPagoSel] = useState<MedioPagoManual>('efectivo');
  const [montoCustomTexto, setMontoCustomTexto] = useState('');

  const montoRecibido = useMemo(() => sumarPagos(pagos), [pagos]);
  const vuelto = useMemo(() => calcularVuelto(montoRecibido, total), [montoRecibido, total]);
  const faltante = useMemo(() => calcularFaltante(montoRecibido, total), [montoRecibido, total]);

  function agregarPago(medio_pago: MedioPago, monto: number) {
    if (monto <= 0) return;
    setPagos((prev) => [...prev, { medio_pago, monto }]);
  }

  function eliminarPago(idx: number) {
    setPagos((prev) => prev.filter((_, i) => i !== idx));
  }

  function agregarPagoCustom() {
    const soloDigitos = montoCustomTexto.replace(/\D/g, '');
    const monto = parseInt(soloDigitos, 10);
    if (monto <= 0) return;
    setPagos((prev) => [...prev, { medio_pago: medioPagoSel, monto }]);
    setMontoCustomTexto('');
  }

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
  //
  // No usan `calcularVuelto`: esa funcion se apaga con el carrito vacio y la
  // proyeccion no, porque muestra lo que el cajero acaba de tipear aunque
  // todavia no haya nada escaneado.
  const importeEnCurso = parseInt(digitosImporte, 10) || 0;
  const recibidoProyectado = montoRecibido + importeEnCurso;
  const faltaProyectado = Math.max(0, total - recibidoProyectado);
  const vueltoProyectado = Math.max(0, recibidoProyectado - total);

  return {
    pagos, setPagos,
    medioPagoSel, setMedioPagoSel,
    montoCustomTexto, setMontoCustomTexto,
    montoRecibido, vuelto, faltante,
    agregarPago, eliminarPago, agregarPagoCustom,
    digitosImporte, escribirImporte, borrarImporte, sumarImporte,
    importeEnCurso, recibidoProyectado, faltaProyectado, vueltoProyectado,
  };
}
