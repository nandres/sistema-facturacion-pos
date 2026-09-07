// La lectura de la báscula: el cajero tipea el peso en gramos y el sistema lo
// convierte a kilos, que es la unidad en la que se cobra.
//
// ── POR QUÉ VIVE ACÁ Y NO EN VentaPOS ──────────────────────────────────────
//
// Estaba adentro del manejador de teclas del input de escaneo, mezclado con el
// modo cantidad y con la búsqueda del producto. Es una conversión de unidades
// que multiplica el precio de lo que se cobra: 1500 gramos mal interpretados
// son 1,5 kg cobrados como 1500.

/**
 * Convierte el peso tipeado en gramos a kilos.
 *
 * Devuelve `null` si no es un peso válido --texto, cero o negativo--, que es
 * lo que dispara el mensaje de error en pantalla.
 *
 * `parseInt` corta en el primer carácter no numérico, así que "1500abc" son
 * 1500 gramos. Es el comportamiento que tenía la pantalla y se conserva: el
 * lector de códigos puede meter basura al final de una lectura mal terminada.
 */
export function pesoDesdeGramos(texto: string): number | null {
  const gramos = parseInt(texto, 10);
  if (!Number.isFinite(gramos) || gramos <= 0) return null;
  return gramos / 1000;
}
