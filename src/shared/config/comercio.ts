// Datos del comercio: salen impresos en el ticket y aparecen en pantalla.
//
// **Ya no se escriben acá.** Antes el nombre y el RUC estaban como constantes
// en este archivo, lo que obligaba a editar el codigo fuente y recompilar el
// instalador para cada cliente. Ahora se configuran por instalacion, desde la
// pantalla de Configuracion, y se guardan en electron-store.
//
// Lo que queda en este archivo es lo que de verdad es compartido: el tipo, el
// valor por defecto y la forma de derivar la linea del RUC.

export interface Comercio {
  nombre: string;
  ruc: string;
}

// Lo que muestra una instalacion que todavia nadie configuro. Se puede sembrar
// desde el .env (COMERCIO_NOMBRE / COMERCIO_RUC) para que una caja recien
// instalada arranque ya con los datos puestos, sin pasar por la pantalla.
export const COMERCIO_DEFECTO: Comercio = {
  nombre: 'MI COMERCIO',
  ruc: '',
};

// El RUC se guarda pelado y la linea compuesta se deriva, porque los tres
// lugares que la muestran quieren exactamente la misma cadena: el ticket
// ESC/POS la centra con centrar(), el ticket HTML la mete en un div centrado
// y la vista previa de caja la maqueta aparte.
//
// Si no hay RUC cargado devuelve cadena vacia, para no imprimir un "RUC:"
// pelado en el comprobante.
export function lineaRuc(ruc: string): string {
  const limpio = ruc.trim();
  return limpio ? `RUC: ${limpio}` : '';
}
