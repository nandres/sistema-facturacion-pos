// El estado del input de escaneo: lo que se está tipeando, los dos modos que
// cambian cómo se interpreta, y el desplegable de sugerencias.
//
// ── POR QUÉ VIVE ACÁ Y NO EN VentaPOS ──────────────────────────────────────
//
// Es el bloque que la regla de oro protege: el lector USB emula un teclado y
// termina cada lectura con `Enter`, así que **el input no puede perder el
// foco** durante el cobro. `refocarEscaneo()` es lo que lo devuelve, y lo
// llaman veinticinco lugares distintos de la pantalla --cada botón, cada
// modal, cada acción que pudo haberse robado el foco--.
//
// ── QUÉ SE QUEDA AFUERA, Y POR QUÉ ─────────────────────────────────────────
//
// `manejarEscaneo` **no** está acá. Interpreta la tecla, sí, pero después
// orquesta el carrito, los mensajes, el editor de productos y la línea
// seleccionada: meterlo en el hook obligaría a inyectarle media pantalla como
// parámetros, y eso es mover el enredo de lugar, no deshacerlo.
//
// Lo que sí salió es la lógica pura que ese manejador usaba: `fijarCantidad` y
// `pesoDesdeGramos` viven en `shared/carrito/` y tienen pruebas propias.
//
// La extracción está cubierta por `VentaPOS.test.tsx`, que escribe en el input
// y dispara `Enter` igual que el lector.

import { useCallback, useRef, useState } from 'react';
import type { Producto } from '../../shared/types/productos';

export function useEscaner() {
  const [codigoEscaneo, setCodigoEscaneo] = useState('');

  /** `*` entra en modo cantidad: lo tipeado deja de ser un código. */
  const [modoCantidad, setModoCantidad] = useState(false);
  /** En modo báscula lo tipeado es el peso en gramos del próximo producto. */
  const [modoBascula, setModoBascula] = useState(false);
  const [pesoPendiente, setPesoPendiente] = useState<number | null>(null);

  // Búsqueda por nombre: se dispara sola cuando lo tipeado tiene letras.
  const [sugerencias, setSugerencias] = useState<Producto[]>([]);
  const [indiceSeleccionado, setIndiceSeleccionado] = useState(-1);
  const [dropdownAbierto, setDropdownAbierto] = useState(false);

  const inputEscaneoRef = useRef<HTMLInputElement>(null);
  const timeoutBusqueda = useRef<ReturnType<typeof setTimeout>>();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const refocarEscaneo = useCallback(() => {
    // setTimeout para correr después del render que pueda haber cambiado
    // el árbol de elementos (botones que aparecen/desaparecen).
    setTimeout(() => inputEscaneoRef.current?.focus(), 0);
  }, []);

  return {
    codigoEscaneo, setCodigoEscaneo,
    modoCantidad, setModoCantidad,
    modoBascula, setModoBascula,
    pesoPendiente, setPesoPendiente,
    sugerencias, setSugerencias,
    indiceSeleccionado, setIndiceSeleccionado,
    dropdownAbierto, setDropdownAbierto,
    inputEscaneoRef, timeoutBusqueda, dropdownRef,
    refocarEscaneo,
  };
}
