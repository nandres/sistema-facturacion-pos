import { useEffect, useRef } from 'react';

/**
 * Registro unico de atajos de teclado.
 *
 * Antes cada pantalla instalaba su propio listener sobre `window`, asi que dos
 * pantallas montadas al mismo tiempo respondian a la misma tecla: F4 retenia la
 * venta y ademas navegaba al menu. Aca hay un solo listener y las suscripciones
 * se consultan por prioridad; la primera que consume la tecla corta la cadena.
 */

/** Devolve `false` para dejar pasar la tecla; cualquier otra cosa la consume. */
export type ManejadorAtajo = (evento: KeyboardEvent) => boolean | void;

/**
 * Mapa `clave` -> manejador. Ej: { F12: cobrar, 'Ctrl+F1': irACaja }.
 *
 * La clave es `evento.key`, con `Ctrl+` y `Alt+` adelante si corresponde (en
 * ese orden). Shift no entra a proposito: en muchos teclados es parte de como
 * se produce el caracter --`*` sale con Shift-- y meterlo en la clave haria
 * que el modo cantidad dejara de responder.
 */
export type MapaAtajos = Record<string, ManejadorAtajo>;

/** Arma la clave de busqueda del evento: 'F1', 'Ctrl+F1', 'Ctrl+Alt+F1'. */
function claveDeEvento(evento: KeyboardEvent): string {
  let clave = evento.key;
  if (evento.altKey) clave = `Alt+${clave}`;
  if (evento.ctrlKey) clave = `Ctrl+${clave}`;
  return clave;
}

/** La pantalla activa se consulta antes que el marco de la aplicacion. */
export const PRIORIDAD_PANTALLA = 10;
export const PRIORIDAD_APP = 0;

interface Suscripcion {
  prioridad: number;
  leerMapa: () => MapaAtajos;
}

const suscripciones = new Set<Suscripcion>();
let listenerInstalado = false;

function alPresionarTecla(evento: KeyboardEvent): void {
  const clave = claveDeEvento(evento);
  const porPrioridad = [...suscripciones].sort((a, b) => b.prioridad - a.prioridad);
  for (const suscripcion of porPrioridad) {
    const manejador = suscripcion.leerMapa()[clave];
    if (!manejador) continue;
    if (manejador(evento) === false) continue;
    evento.preventDefault();
    return;
  }
}

/**
 * Suscribe un mapa de atajos mientras el componente este montado.
 *
 * El mapa se lee por referencia en cada pulsacion, no se captura al suscribir:
 * los manejadores siempre ven el estado actual del componente sin necesidad de
 * declarar dependencias (que es de donde salian los cierres viejos).
 */
export function useAtajos(mapa: MapaAtajos, prioridad: number = PRIORIDAD_PANTALLA): void {
  const mapaRef = useRef(mapa);
  mapaRef.current = mapa;

  useEffect(() => {
    const suscripcion: Suscripcion = { prioridad, leerMapa: () => mapaRef.current };
    suscripciones.add(suscripcion);
    if (!listenerInstalado) {
      window.addEventListener('keydown', alPresionarTecla);
      listenerInstalado = true;
    }
    return () => {
      suscripciones.delete(suscripcion);
      if (suscripciones.size === 0) {
        window.removeEventListener('keydown', alPresionarTecla);
        listenerInstalado = false;
      }
    };
  }, [prioridad]);
}
