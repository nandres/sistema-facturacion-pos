import { dialog } from 'electron';
import { obtenerClienteSupabase } from './baseService';
import { log } from './logger';

interface ColumnaMapeada {
  columna: string;
  campo: string;
}

const CAMPOS = ['codigo_barras', 'nombre', 'precio_venta', 'precio_costo', 'stock', 'iva'] as const;

export async function importarExcel(): Promise<{ ok: true; insertados: number; total: number } | { ok: false; error: string }> {
  try {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Excel', extensions: ['xlsx', 'xls'] }],
    });

    if (canceled || filePaths.length === 0) return { ok: true, insertados: 0, total: 0 };

    // Se lee con exceljs, no con xlsx: acá se parsea un archivo que eligió el
    // usuario, en el proceso main y con privilegios de Node. `xlsx` (SheetJS
    // community) arrastra prototype pollution y ReDoS sin versión parchada, y
    // este era el único lugar del sistema donde eso era alcanzable.
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(filePaths[0]);

    const hoja = wb.worksheets[0];
    if (!hoja || hoja.rowCount < 2) return { ok: false, error: 'El archivo no contiene datos.' };

    // Primera fila = encabezados. Las siguientes, datos.
    const encabezados: string[] = [];
    hoja.getRow(1).eachCell({ includeEmpty: true }, (celda, col) => {
      encabezados[col - 1] = textoDeCelda(celda.value);
    });

    const filas: Record<string, string>[] = [];
    for (let n = 2; n <= hoja.rowCount; n++) {
      const fila = hoja.getRow(n);
      const registro: Record<string, string> = {};
      let tieneAlgo = false;
      encabezados.forEach((clave, i) => {
        if (!clave) return;
        const valor = textoDeCelda(fila.getCell(i + 1).value);
        registro[clave] = valor;
        if (valor) tieneAlgo = true;
      });
      if (tieneAlgo) filas.push(registro);
    }

    if (filas.length === 0) return { ok: false, error: 'El archivo no contiene datos.' };

    const columnasArchivo = Object.keys(filas[0]);
    const mapeo = detectarColumnas(columnasArchivo);

    if (mapeo.length === 0) {
      return { ok: false, error: `No se pudieron detectar columnas. El archivo debe tener al menos: código, nombre, precio venta. Columnas encontradas: ${columnasArchivo.join(', ')}` };
    }

    const supabase = obtenerClienteSupabase();
    let insertados = 0;

    for (const fila of filas) {
      const producto: Record<string, unknown> = {};
      for (const m of mapeo) {
        let valor = fila[m.columna]?.toString().trim() || '';
        if (m.campo === 'precio_venta' || m.campo === 'precio_costo') {
          valor = valor.replace(/[^0-9.]/g, '');
          producto[m.campo] = parseFloat(valor) || 0;
        } else if (m.campo === 'stock' || m.campo === 'iva') {
          producto[m.campo] = parseInt(valor.replace(/\D/g, '')) || 0;
        } else {
          producto[m.campo] = valor;
        }
      }

      if (!producto.codigo_barras || !producto.nombre || !producto.precio_venta) continue;

      const { error } = await supabase.from('productos').upsert(producto, { onConflict: 'codigo_barras' });
      if (!error) insertados++;
    }

    log.info(`[importacion] ${insertados}/${filas.length} productos importados desde ${filePaths[0]}`);
    return { ok: true, insertados, total: filas.length };
  } catch (err) {
    log.error('[importacion] Error:', err);
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Una celda de exceljs no siempre es un dato plano: puede venir como fórmula,
 * texto enriquecido, hipervínculo o fecha. Esto lo aplana a la cadena que el
 * usuario ve en la planilla, que es lo que hay que mapear a la columna.
 */
function textoDeCelda(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'string') return valor.trim();
  if (typeof valor === 'number' || typeof valor === 'boolean') return String(valor);
  if (valor instanceof Date) return valor.toISOString();

  const v = valor as Record<string, unknown>;
  // Fórmula: interesa el resultado calculado, no la expresión.
  if ('result' in v) return textoDeCelda(v.result);
  // Texto enriquecido: se concatenan los tramos.
  if (Array.isArray(v.richText)) {
    return (v.richText as { text?: string }[]).map((t) => t.text ?? '').join('').trim();
  }
  if ('text' in v) return textoDeCelda(v.text);
  if ('hyperlink' in v) return textoDeCelda(v.text ?? v.hyperlink);
  return String(valor).trim();
}

function detectarColumnas(columnas: string[]): ColumnaMapeada[] {
  const sinonimos: Record<string, string[]> = {
    codigo_barras: ['código', 'codigo', 'codigo barras', 'código barras', 'codigo de barras', 'código de barras', 'barcode', 'ean', 'cod'],
    nombre: ['nombre', 'producto', 'descripción', 'descripcion', 'item', 'artículo', 'articulo'],
    precio_venta: ['precio venta', 'precio', 'precio_venta', 'venta', 'pvp', 'precio final'],
    precio_costo: ['precio costo', 'costo', 'precio_costo', 'coste', 'precio compra'],
    stock: ['stock', 'cantidad', 'existencia', 'inventario', 'unidades'],
    iva: ['iva', 'impuesto', 'tasa iva', '% iva'],
  };

  const mapeo: ColumnaMapeada[] = [];
  const colsLower = columnas.map((c) => c.toLowerCase().trim());

  for (const campo of CAMPOS) {
    const alt = sinonimos[campo];
    for (let i = 0; i < colsLower.length; i++) {
      if (alt.some((a) => colsLower[i] === a || colsLower[i].includes(a))) {
        mapeo.push({ columna: columnas[i], campo });
        break;
      }
    }
  }

  return mapeo;
}
