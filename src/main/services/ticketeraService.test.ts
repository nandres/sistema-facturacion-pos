import { describe, it, expect, vi } from 'vitest';

// ── POR QUÉ ESTA PRUEBA EXISTE ─────────────────────────────────────────────
//
// «`construirTicket()`, `construirNotaCredito()` y `construirEtiquetaCodigo()`
// devuelven los mismos bytes, incluido el pulso del cajón» es la regla de oro
// del proyecto, y hasta ahora era un comentario en CLAUDE.md: dependía de que
// quien tocara el archivo lo hubiera leído.
//
// Acá deja de depender de eso. Si alguien cambia un byte del ticket, el
// snapshot falla y hay que decidirlo a propósito en vez de descubrirlo cuando
// la ticketera del mostrador imprime cualquier cosa --o cuando el cajón deja
// de abrirse a mitad de un turno.

// El módulo importa `app` de electron al cargarse, y el comercio sale de
// configService, que abre un electron-store. Ninguno de los dos hace falta
// para armar bytes: se reemplazan por lo mínimo.
vi.mock('electron', () => ({
  app: { getPath: () => 'C:/tmp' },
}));

vi.mock('./configService', () => ({
  obtenerComercio: () => ({ nombre: 'AUTOSERVICE J & M', ruc: '80012345-6' }),
  obtenerImpresoraConfig: () => null,
  obtenerPuertoImpresoraCache: () => null,
  recordarPuertoImpresora: () => undefined,
  olvidarPuertoImpresora: () => undefined,
}));

vi.mock('./printHTMLService', () => ({
  imprimirTicketHTML: () => Promise.resolve(),
  imprimirPagina: () => Promise.resolve(),
}));

const { construirTicket, construirNotaCredito, construirEtiquetaCodigo, construirTicketZ, generarCodigoEAN13 } =
  await import('./ticketeraService');

const CORTE = Buffer.from([0x1d, 0x56, 0x00]);
const PULSO_CAJON = Buffer.from([0x1b, 0x70, 0x00, 0x30, 0xff]);
const PAPER_WIDTH = 32;

const venta = {
  id_venta: 42,
  // Fecha fija: `toLocaleString` la formatea y una fecha variable haría fallar
  // el snapshot cada día.
  fecha_hora: '2026-03-15T14:30:00.000Z',
  total_pagado: 47500,
  monto_recibido: 50000,
  vuelto: 2500,
  tipo_pago: 'efectivo',
  lineas: [
    { nombre: 'COCA COLA 2L RETORNABLE', cantidad: 2, precio_unitario: 12500 },
    { nombre: 'PAN FELIPE', cantidad: 6, precio_unitario: 1500 },
    { nombre: 'LECHE ENTERA 1L', cantidad: 1, precio_unitario: 13500 },
  ],
  ivaPorTasa: { 10: 3409, 5: 643 },
};

/**
 * El ticket sin los bytes de control, para poder medirlo como texto.
 *
 * Las secuencias se sacan con su largo exacto. Un patrón perezoso --ESC más un
 * carácter-- deja atrás el parámetro de las secuencias de tres bytes, y ese
 * byte suelto cuenta como columna: la medición da 33 donde el papel tiene 32 y
 * la prueba falla sin que el ticket tenga nada malo.
 */
function comoTexto(b: Buffer): string {
  const ESC = String.fromCharCode(0x1b);
  const GS = String.fromCharCode(0x1d);
  return b.toString('latin1')
    .replace(new RegExp(`${ESC}p[\\s\\S]{3}`, 'g'), '')  // ESC p m t1 t2 — cajón (5 bytes)
    .replace(new RegExp(`${ESC}@`, 'g'), '')             // ESC @ — inicializar (2)
    .replace(new RegExp(`${ESC}[Ea][\\s\\S]`, 'g'), '')  // ESC E/a n — negrita, alineación (3)
    .replace(new RegExp(`${GS}[!V][\\s\\S]`, 'g'), '')   // GS !/V n — tamaño, corte (3)
    // Lo que haya quedado suelto: todo control salvo el salto de línea.
    .split('')
    .filter((c) => c === '\n' || c.charCodeAt(0) >= 0x20)
    .join('');
}

describe('construirTicket', () => {
  const ticket = construirTicket(venta);

  it('los bytes no cambian', () => {
    expect(ticket.toString('base64')).toMatchSnapshot();
  });

  it('termina con el corte y con el pulso que abre el cajón', () => {
    // El orden importa: primero corta, después abre. Si se invierte, el cajón
    // se abre con el papel todavía adentro del cabezal.
    const cola = ticket.subarray(ticket.length - CORTE.length - PULSO_CAJON.length);
    expect(cola).toEqual(Buffer.concat([CORTE, PULSO_CAJON]));
  });

  it('ninguna línea se pasa de las 32 columnas del papel', () => {
    // Una línea más larga envuelve en el papel y el ticket se lee mal. Es el
    // modo de falla más común al tocar el layout.
    for (const linea of comoTexto(ticket).split('\n')) {
      expect(linea.length, `«${linea}» mide ${linea.length}`).toBeLessThanOrEqual(PAPER_WIDTH);
    }
  });

  it('trae el número de ticket, el total y el vuelto', () => {
    const texto = comoTexto(ticket);
    expect(texto).toContain('0000042');
    expect(texto).toContain('47.500');
    expect(texto).toContain('2.500');
  });

  it('desglosa el IVA por tasa', () => {
    const texto = comoTexto(ticket);
    expect(texto).toContain('IVA 10%');
    expect(texto).toContain('3.409');
  });

  it('saca los acentos y los signos de apertura, que la ticketera no imprime', () => {
    const texto = comoTexto(ticket);
    expect(texto).toContain('Ticket valido como');   // «válido» normalizado
    expect(texto).toContain('Gracias por su compra');
    // El `¡` llegaba crudo como 0xA1 y la ticketera, en CP437, lo imprimía
    // como `i`: el ticket salía con «iGracias por su compra!».
    expect(texto).not.toContain('¡');
    expect(texto).not.toContain('í');
  });
});

describe('construirNotaCredito', () => {
  const nota = construirNotaCredito({
    id_venta: 42,
    fecha_hora: '2026-03-15T14:30:00.000Z',
    total_pagado: 12500,
    tipo_pago: 'efectivo',
    lineas: [{ nombre: 'COCA COLA 2L RETORNABLE', cantidad: 1, precio_unitario: 12500 }],
  });

  it('los bytes no cambian', () => {
    expect(nota.toString('base64')).toMatchSnapshot();
  });

  it('también abre el cajón: la devolución saca plata', () => {
    expect(nota.subarray(nota.length - PULSO_CAJON.length)).toEqual(PULSO_CAJON);
  });

  it('respeta las 32 columnas', () => {
    for (const linea of comoTexto(nota).split('\n')) {
      expect(linea.length, `«${linea}»`).toBeLessThanOrEqual(PAPER_WIDTH);
    }
  });
});

describe('construirTicketZ', () => {
  // El turno del ejemplo de A-07: 500.000 de fondo, 1.250.000 de efectivo
  // vendido y un retiro de 200.000. El cajón tiene 1.550.000 y la caja cuadra.
  const z = construirTicketZ({
    id_arqueo: 7,
    cajero: 'MARCOS',
    fecha_apertura: '2026-03-15T08:00:00.000Z',
    fecha_cierre: '2026-03-15T20:00:00.000Z',
    fondo_inicial: 500000,
    total_efectivo: 1250000,
    total_tarjeta: 300000,
    total_transferencia: 0,
    total_mixto: 0,
    total_ventas: 1550000,
    entradas: 0,
    retiros: 200000,
    esperado: 1550000,
    declarado: 1550000,
    diferencia: 0,
  });

  it('los bytes no cambian', () => {
    expect(z.toString('base64')).toMatchSnapshot();
  });

  it('corta el papel pero NO abre el cajón', () => {
    // Decisión deliberada: al cierre la plata ya se contó, y el Z se reimprime
    // desde el historial. Abrirlo otra vez lo dejaría abierto si el ticket sale
    // sin nadie delante.
    expect(z.subarray(z.length - CORTE.length)).toEqual(CORTE);
    expect(z.includes(PULSO_CAJON)).toBe(false);
  });

  it('respeta las 32 columnas: rótulo 15 + importe 17', () => {
    for (const linea of comoTexto(z).split('\n')) {
      expect(linea.length, `«${linea}»`).toBeLessThanOrEqual(PAPER_WIDTH);
    }
  });
});

describe('construirEtiquetaCodigo', () => {
  it('los bytes no cambian', () => {
    const etiqueta = construirEtiquetaCodigo({
      codigo: '2001234567895',
      nombre: 'QUESO PARAGUAY KG',
      precio: 45000,
    });
    expect(etiqueta.toString('base64')).toMatchSnapshot();
  });
});

describe('generarCodigoEAN13', () => {
  it('devuelve 13 dígitos con el prefijo interno 200', () => {
    const codigo = generarCodigoEAN13(123456789);
    expect(codigo).toHaveLength(13);
    expect(codigo.startsWith('200')).toBe(true);
    expect(codigo).toMatch(/^\d{13}$/);
  });

  it('el dígito verificador cierra según el algoritmo EAN-13', () => {
    const codigo = generarCodigoEAN13(123456789);
    const digitos = codigo.split('').map(Number);
    const suma = digitos
      .slice(0, 12)
      .reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 1 : 3), 0);
    expect((10 - (suma % 10)) % 10).toBe(digitos[12]);
  });

  it('con la misma semilla da el mismo código', () => {
    expect(generarCodigoEAN13(42)).toBe(generarCodigoEAN13(42));
  });
});
