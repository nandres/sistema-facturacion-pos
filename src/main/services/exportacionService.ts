import ExcelJS from 'exceljs';
import { listarVentas, obtenerDetalleVenta } from './ventaHistorialService';
import { log } from './logger';

/**
 * Exportación de ventas a Excel.
 *
 * Vive en el proceso main, y no en la pantalla, por dos razones:
 *
 *  1. **Seguridad.** Reemplaza a `xlsx` (SheetJS community), que arrastra
 *     prototype pollution y ReDoS sin versión parchada.
 *  2. **Los estilos ahora se aplican.** La versión community de SheetJS
 *     directamente ignora los estilos de celda: el código anterior los
 *     calculaba con todo detalle y el archivo salía en blanco y negro.
 *
 * De paso se corrigen las fórmulas. El código anterior escribía `SUMA(...)` y
 * `CONTARA(...)`, en español. Dentro del archivo .xlsx las fórmulas se guardan
 * **siempre en inglés** --Excel las muestra traducidas según la configuración
 * del usuario--, así que esas celdas llegaban rotas.
 */

// exceljs usa ARGB: los dos primeros dígitos son el alfa.
const C = {
  tinta: 'FF1F2937',
  tintaSuave: 'FF6B7280',
  tintaTenue: 'FF9CA3AF',
  blanco: 'FFFFFFFF',
  verde: 'FF059669',
  verdeClaro: 'FFECFDF5',
  azul: 'FF2563EB',
  azulClaro: 'FFEFF6FF',
  rojo: 'FFDC2626',
  borde: 'FFD1D5DB',
} as const;

const FUENTE = 'Calibri';
const BORDE_FINO: Partial<ExcelJS.Borders> = {
  top: { style: 'thin', color: { argb: C.borde } },
  bottom: { style: 'thin', color: { argb: C.borde } },
  left: { style: 'thin', color: { argb: C.borde } },
  right: { style: 'thin', color: { argb: C.borde } },
};

const GS = '#,##0';

function titulo(celda: ExcelJS.Cell): void {
  celda.font = { name: FUENTE, size: 14, bold: true, color: { argb: C.tinta } };
  celda.alignment = { horizontal: 'left', vertical: 'middle' };
}

function subtitulo(celda: ExcelJS.Cell): void {
  celda.font = { name: FUENTE, size: 10, italic: true, color: { argb: C.tintaSuave } };
  celda.alignment = { horizontal: 'left', vertical: 'middle' };
}

function encabezado(celda: ExcelJS.Cell, color: string): void {
  celda.font = { name: FUENTE, size: 10, bold: true, color: { argb: C.blanco } };
  celda.alignment = { horizontal: 'center', vertical: 'middle' };
  celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
  celda.border = BORDE_FINO;
}

type Alineacion = 'left' | 'center' | 'right';

function dato(celda: ExcelJS.Cell, al: Alineacion, moneda = false): void {
  celda.font = { name: FUENTE, size: 10, color: { argb: C.tinta } };
  celda.alignment = { horizontal: al, vertical: 'middle' };
  celda.border = BORDE_FINO;
  if (moneda) celda.numFmt = GS;
}

function totalizador(celda: ExcelJS.Cell, al: Alineacion, fondo: string, moneda = false): void {
  celda.font = { name: FUENTE, size: 10, bold: true, color: { argb: C.tinta } };
  celda.alignment = { horizontal: al, vertical: 'middle' };
  celda.border = BORDE_FINO;
  celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fondo } };
  if (moneda) celda.numFmt = GS;
}

function pie(celda: ExcelJS.Cell): void {
  celda.font = { name: FUENTE, size: 8, italic: true, color: { argb: C.tintaTenue } };
  celda.alignment = { horizontal: 'left' };
}

const PIE = 'Reporte generado automáticamente por Sistema de Facturación';

export async function construirLibroVentas(
  desde?: string,
  hasta?: string,
  idUsuario?: number,
): Promise<{ buffer: Buffer; ventas: number }> {
  const ventas = await listarVentas(desde, hasta, idUsuario);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Sistema de Facturación';
  wb.created = new Date();

  const ahora = new Date();
  const fechaGen = ahora.toLocaleString('es-PY');

  /* ── Hoja 1 — Resumen de ventas ───────────────────────────────────────── */
  const h1 = wb.addWorksheet('Resumen');
  h1.columns = [
    { width: 12 }, { width: 22 }, { width: 16 }, { width: 16 },
    { width: 16 }, { width: 16 }, { width: 12 },
  ];

  h1.getCell('A2').value = 'REPORTE DE VENTAS';
  titulo(h1.getCell('A2'));
  h1.mergeCells('A2:G2');

  h1.getCell('A3').value = `Generado el ${fechaGen} — ${ventas.length} venta${ventas.length !== 1 ? 's' : ''}`;
  subtitulo(h1.getCell('A3'));
  h1.mergeCells('A3:G3');

  const cols1 = ['ID Venta', 'Fecha', 'Total Gs.', 'Recibido Gs.', 'Vuelto Gs.', 'Tipo Pago', 'Estado'];
  const FILA_ENC1 = 6;
  cols1.forEach((t, i) => {
    const c = h1.getCell(FILA_ENC1, i + 1);
    c.value = t;
    encabezado(c, C.verde);
  });

  ventas.forEach((v, i) => {
    const f = FILA_ENC1 + 1 + i;
    h1.getCell(f, 1).value = v.id_venta;
    h1.getCell(f, 2).value = new Date(v.fecha_hora).toLocaleString('es-PY');
    h1.getCell(f, 3).value = v.total_pagado;
    h1.getCell(f, 4).value = v.monto_recibido;
    h1.getCell(f, 5).value = v.vuelto;
    h1.getCell(f, 6).value = v.tipo_pago;
    h1.getCell(f, 7).value = v.estado;

    dato(h1.getCell(f, 1), 'center');
    dato(h1.getCell(f, 2), 'left');
    dato(h1.getCell(f, 3), 'right', true);
    dato(h1.getCell(f, 4), 'right', true);
    dato(h1.getCell(f, 5), 'right', true);
    dato(h1.getCell(f, 6), 'center');

    const est = h1.getCell(f, 7);
    dato(est, 'center');
    const color = v.estado === 'activa' ? C.verde : v.estado === 'anulada' ? C.rojo : C.tintaSuave;
    est.font = { name: FUENTE, size: 10, bold: true, color: { argb: color } };
  });

  if (ventas.length > 0) {
    const fTot = FILA_ENC1 + ventas.length + 1;
    const desde1 = FILA_ENC1 + 1;
    const hasta1 = FILA_ENC1 + ventas.length;

    h1.getCell(fTot, 1).value = 'TOTALES';
    h1.getCell(fTot, 2).value = { formula: `COUNTA(B${desde1}:B${hasta1})` };
    for (const col of ['C', 'D', 'E']) {
      h1.getCell(`${col}${fTot}`).value = { formula: `SUM(${col}${desde1}:${col}${hasta1})` };
    }
    for (let c = 1; c <= 7; c++) {
      const celda = h1.getCell(fTot, c);
      const moneda = c >= 3 && c <= 5;
      totalizador(celda, c <= 2 ? 'center' : 'right', C.verdeClaro, moneda);
    }

    h1.autoFilter = { from: { row: FILA_ENC1, column: 1 }, to: { row: hasta1, column: 7 } };

    const fPie = fTot + 2;
    h1.getCell(fPie, 1).value = PIE;
    pie(h1.getCell(fPie, 1));
    h1.mergeCells(fPie, 1, fPie, 7);
  }

  h1.views = [{ state: 'frozen', ySplit: FILA_ENC1 }];

  /* ── Hoja 2 — Detalle de productos ────────────────────────────────────── */
  const filasDet: (string | number)[][] = [];
  let totalItems = 0;
  for (const v of ventas) {
    const det = await obtenerDetalleVenta(v.id_venta);
    if (!det) continue;
    const fecha = new Date(v.fecha_hora).toLocaleString('es-PY');
    for (const l of det.lineas) {
      filasDet.push([v.id_venta, fecha, l.codigo_barras, l.nombre, l.cantidad, l.precio_unitario, l.cantidad * l.precio_unitario]);
      totalItems += l.cantidad;
    }
  }

  if (filasDet.length > 0) {
    const h2 = wb.addWorksheet('Detalle');
    h2.columns = [
      { width: 12 }, { width: 20 }, { width: 18 }, { width: 34 },
      { width: 10 }, { width: 18 }, { width: 18 },
    ];

    h2.getCell('A2').value = 'DETALLE DE PRODUCTOS VENDIDOS';
    titulo(h2.getCell('A2'));
    h2.mergeCells('A2:G2');

    h2.getCell('A3').value = `${filasDet.length} línea${filasDet.length !== 1 ? 's' : ''} · ${totalItems} artículo${totalItems !== 1 ? 's' : ''}`;
    subtitulo(h2.getCell('A3'));
    h2.mergeCells('A3:G3');

    const cols2 = ['ID Venta', 'Fecha', 'Código Barras', 'Producto', 'Cantidad', 'Precio Unit. Gs.', 'Subtotal Gs.'];
    const FILA_ENC2 = 6;
    cols2.forEach((t, i) => {
      const c = h2.getCell(FILA_ENC2, i + 1);
      c.value = t;
      encabezado(c, C.azul);
    });

    filasDet.forEach((fila, i) => {
      const f = FILA_ENC2 + 1 + i;
      fila.forEach((valor, c) => {
        const celda = h2.getCell(f, c + 1);
        celda.value = valor;
        const al: Alineacion = c === 3 ? 'left' : c >= 5 ? 'right' : 'center';
        dato(celda, al, c >= 5);
      });
    });

    const fTot2 = FILA_ENC2 + filasDet.length + 1;
    const d2 = FILA_ENC2 + 1;
    const h2f = FILA_ENC2 + filasDet.length;
    h2.getCell(fTot2, 1).value = 'TOTALES';
    for (const col of ['E', 'F', 'G']) {
      h2.getCell(`${col}${fTot2}`).value = { formula: `SUM(${col}${d2}:${col}${h2f})` };
    }
    for (let c = 1; c <= 7; c++) {
      const al: Alineacion = c === 4 || c === 2 ? 'left' : c >= 6 ? 'right' : 'center';
      totalizador(h2.getCell(fTot2, c), al, C.azulClaro, c >= 6);
    }

    const fPie2 = fTot2 + 2;
    h2.getCell(fPie2, 1).value = PIE;
    pie(h2.getCell(fPie2, 1));
    h2.mergeCells(fPie2, 1, fPie2, 7);

    h2.views = [{ state: 'frozen', ySplit: FILA_ENC2 }];
  }

  /* ── Hoja 3 — Resumen financiero ──────────────────────────────────────── */
  const h3 = wb.addWorksheet('Resumen Financiero');
  h3.columns = [{ width: 32 }, { width: 20 }];

  h3.getCell('A1').value = 'RESUMEN FINANCIERO';
  titulo(h3.getCell('A1'));
  h3.mergeCells('A1:B1');

  const totalGs = ventas.reduce((s, v) => s + v.total_pagado, 0);
  const totalRecibido = ventas.reduce((s, v) => s + v.monto_recibido, 0);
  const totalVuelto = ventas.reduce((s, v) => s + v.vuelto, 0);

  const porTipo: Record<string, { cant: number; monto: number }> = {};
  for (const v of ventas) {
    const t = v.tipo_pago || 'sin-especificar';
    if (!porTipo[t]) porTipo[t] = { cant: 0, monto: 0 };
    porTipo[t].cant++;
    porTipo[t].monto += v.total_pagado;
  }

  let f = 3;
  const metrica = (etiqueta: string, valor: number, moneda = true) => {
    h3.getCell(f, 1).value = etiqueta;
    h3.getCell(f, 2).value = valor;
    totalizador(h3.getCell(f, 1), 'left', C.blanco);
    totalizador(h3.getCell(f, 2), 'right', C.blanco, moneda);
    f++;
  };
  const seccion = (texto: string) => {
    f++;
    h3.getCell(f, 1).value = texto;
    const c = h3.getCell(f, 1);
    c.font = { name: FUENTE, size: 10, bold: true, color: { argb: C.verde } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.verdeClaro } };
    c.border = BORDE_FINO;
    h3.getCell(f, 2).border = BORDE_FINO;
    h3.getCell(f, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.verdeClaro } };
    f++;
  };

  h3.getCell(f, 1).value = 'Métrica';
  h3.getCell(f, 2).value = 'Valor (Gs.)';
  encabezado(h3.getCell(f, 1), C.verde);
  encabezado(h3.getCell(f, 2), C.verde);
  f++;

  metrica('Cantidad de Ventas', ventas.length, false);
  metrica('Total Artículos Vendidos', totalItems, false);
  metrica('Total Facturado', totalGs);
  metrica('Total Recibido', totalRecibido);
  metrica('Total Vuelto', totalVuelto);

  seccion('Desglose por forma de pago');
  for (const [tipo, d] of Object.entries(porTipo)) {
    h3.getCell(f, 1).value = `  ${tipo} (${d.cant})`;
    h3.getCell(f, 2).value = d.monto;
    const c1 = h3.getCell(f, 1);
    c1.font = { name: FUENTE, size: 10, italic: true, color: { argb: C.tinta } };
    c1.alignment = { horizontal: 'left' };
    c1.border = BORDE_FINO;
    dato(h3.getCell(f, 2), 'right', true);
    f++;
  }

  f++;
  h3.getCell(f, 1).value = 'Generado el';
  h3.getCell(f, 2).value = fechaGen;
  pie(h3.getCell(f, 1));
  pie(h3.getCell(f, 2));

  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  log.info(`[exportacion] libro de ventas armado: ${ventas.length} ventas, ${filasDet.length} líneas`);
  return { buffer, ventas: ventas.length };
}
