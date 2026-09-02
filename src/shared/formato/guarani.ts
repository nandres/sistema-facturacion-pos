// Formato de moneda para Paraguay: punto como separador de miles y sin
// decimales (el guarani no tiene subunidad de uso diario). Ej: 1234567 ->
// "1.234.567".
//
// Vive en shared/ porque lo usan los dos procesos: el renderer para la
// pantalla y el main para el ticket ESC/POS. Tenerlo en un solo lugar es lo
// que evita que el comprobante impreso muestre "150000" mientras la vista
// previa muestra "150.000".
//
// El agrupado se hace a mano, sin Intl, para que el ticket salga igual en
// cualquier maquina sin depender de que ICU tenga la locale es-PY cargada.

const SEPARADOR_MILES = '.';

export function formatearGs(valor: number): string {
  if (!Number.isFinite(valor)) return '0';
  const entero = Math.round(valor);
  const signo = entero < 0 ? '-' : '';
  const digitos = String(Math.abs(entero));

  let agrupado = '';
  for (let i = 0; i < digitos.length; i++) {
    if (i > 0 && (digitos.length - i) % 3 === 0) agrupado += SEPARADOR_MILES;
    agrupado += digitos[i];
  }
  return signo + agrupado;
}

// Con prefijo "Gs. ", para mostrar en pantalla o en el ticket. Para inputs y
// calculos internos usar formatearGs(...) sin prefijo.
export function formatearGsConPrefijo(valor: number): string {
  return `Gs. ${formatearGs(valor)}`;
}

// Parse inverso: "1.234.567", "Gs. 1.234.567" o "1234567" -> 1234567.
// Devuelve NaN si no se puede convertir.
export function parsearGs(texto: string): number {
  const limpio = texto
    .replace(/Gs\.?/gi, '')
    .replace(/\s/g, '')
    .replace(/\./g, '');
  if (limpio === '') return NaN;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : NaN;
}
