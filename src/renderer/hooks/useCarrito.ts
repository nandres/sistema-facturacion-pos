// El carrito de la venta en curso y todo lo que se deduce de él: el total, el
// IVA por tasa, el desglose fiscal y los envases retornables disponibles.
//
// ── POR QUÉ VIVE ACÁ Y NO EN VentaPOS ──────────────────────────────────────
//
// Es el estado del que cuelga el resto de la pantalla: los pagos comparan
// contra `total`, el recuadro fiscal sale de `basePorTasa`, y el ticket imprime
// las dos cosas. Tenerlo suelto entre otros treinta `useState` hacía que cada
// número pareciera independiente cuando en realidad salen todos del mismo lado.
//
// Las **operaciones** del carrito no están acá: viven en
// `shared/carrito/lineas.ts`, sin React, y tienen pruebas propias. Este hook
// guarda el estado; aquel decide qué pasa cuando se agrega o se corrige una
// línea.
//
// ── LA CUENTA QUE NO PUEDE DISCREPAR ───────────────────────────────────────
//
// Total, IVA y bases salen los tres de `fiscal.ts`, de la misma definición de
// «cuánto se cobra por esta línea». Recalcularlos a mano es lo que causó A-06:
// el total restaba el envase devuelto y el IVA no, y el mismo recuadro mostraba
// «Gravadas 10%: 9.500» al lado de un IVA calculado sobre 12.500.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Envase } from '../../shared/types/ventas';
import type { LineaCarrito } from '../../shared/carrito/lineas';
import {
  calcularTotal, calcularIvaPorTasa, calcularIvaTotal, calcularBasePorTasa,
  calcularDescuentoTotal, descuentoLinea as descuentoDeLinea,
} from '../../shared/calculos/fiscal';

export function useCarrito() {
  const [carrito, setCarrito] = useState<LineaCarrito[]>([]);

  // Linea sobre la que actuan F3 (cantidad) y F4 (anular). Arranca en la
  // ultima escaneada, que es lo que el cajero quiere corregir el 99% de las
  // veces; las flechas mueven la seleccion cuando el desplegable esta cerrado.
  const [lineaSel, setLineaSel] = useState(-1);

  const [envasesList, setEnvasesList] = useState<Envase[]>([]);

  // Espejo del carrito para leerlo desde temporizadores y atajos sin volver a
  // suscribirlos en cada cambio.
  const carritoRef = useRef(carrito);
  carritoRef.current = carrito;

  const total = useMemo(() => calcularTotal(carrito), [carrito]);

  // El IVA se calcula sobre lo que se cobra, con el envase devuelto ya
  // descontado: la misma expresión que `total` y que `basePorTasa`.
  const ivaPorTasa = useMemo(() => calcularIvaPorTasa(carrito), [carrito]);
  const ivaTotal = useMemo(() => calcularIvaTotal(carrito), [carrito]);

  // Desglose para el recuadro fiscal. En Paraguay el precio de gondola ya trae
  // el IVA adentro, asi que cada casillero lleva el importe cobrado --con IVA--
  // y el IVA es la porcion de ese importe que le toca a la DNIT.
  //
  // Exentas + Gravadas 5% + Gravadas 10% tiene que dar exactamente el TOTAL A
  // PAGAR: es lo primero que cualquiera cruza al mirar el recuadro.
  const basePorTasa = useMemo(() => calcularBasePorTasa(carrito), [carrito]);

  // Descuento de la linea: hoy la unica fuente es el envase devuelto.
  const descuentoLinea = useCallback((l: LineaCarrito) => descuentoDeLinea(l), []);
  const descuentoTotal = useMemo(() => calcularDescuentoTotal(carrito), [carrito]);

  // Lo de arriba del descuento: sirve para mostrar cuanto se ahorro el cliente.
  const subtotalBruto = useMemo(
    () => carrito.reduce((a, l) => a + l.precio_unitario * l.cantidad, 0),
    [carrito],
  );
  const unidades = useMemo(() => carrito.reduce((a, l) => a + l.cantidad, 0), [carrito]);

  useEffect(() => {
    window.api.envases.listar().then((r) => { if (r.ok) setEnvasesList(r.data); });
  }, []);

  // Red de seguridad: la seleccion no puede quedar apuntando fuera del carrito
  // despues de anular una linea. Quien agrega la mueve explicitamente.
  useEffect(() => {
    setLineaSel((prev) => (prev >= carrito.length ? carrito.length - 1 : prev));
  }, [carrito.length]);

  return {
    carrito, setCarrito, carritoRef,
    lineaSel, setLineaSel,
    envasesList, setEnvasesList,
    total, ivaPorTasa, ivaTotal, basePorTasa,
    descuentoLinea, descuentoTotal,
    subtotalBruto, unidades,
  };
}
