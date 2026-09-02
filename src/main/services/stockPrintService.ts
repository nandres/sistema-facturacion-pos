import { BrowserWindow } from 'electron';
import { obtenerClienteSupabase } from './baseService';
import { log } from './logger';

const STOCK_MINIMO = 5;

import type { ProductoFaltante } from '../../shared/types/productos';

export type { ProductoFaltante };

export async function obtenerListaCompras(stockMinimo = STOCK_MINIMO): Promise<{ productos: ProductoFaltante[]; total: number }> {
  try {
    const supabase = obtenerClienteSupabase();
    const { data, error } = await supabase
      .from('productos')
      .select('codigo_barras, nombre, stock')
      .eq('activo', true)
      .lt('stock', stockMinimo)
      .order('nombre', { ascending: true });

    if (error) throw error;

    // El `select` de arriba pide tres columnas: la fila que vuelve tiene esa
    // forma y no hace falta apagar el chequeo de tipos para recorrerla.
    type FilaStock = Pick<ProductoFaltante, 'codigo_barras' | 'nombre' | 'stock'>;
    const productos: ProductoFaltante[] = ((data ?? []) as FilaStock[]).map((p) => ({
      codigo_barras: p.codigo_barras,
      nombre: p.nombre,
      stock: p.stock,
      stock_minimo: stockMinimo,
      cantidad_necesaria: stockMinimo - p.stock,
    }));

    return { productos, total: productos.length };
  } catch (err) {
    log.error('[stockPrint] Error al obtener lista:', err);
    return { productos: [], total: 0 };
  }
}

export async function imprimirListaCompras(productos: ProductoFaltante[]): Promise<boolean> {
  try {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return false;

    const fecha = new Date().toLocaleDateString('es-PY', { year: 'numeric', month: 'long', day: 'numeric' });
    const filas = productos.map((p, i) => `
      <tr>
        <td style="padding:4px 6px;border:1px solid #ccc;text-align:center">${i + 1}</td>
        <td style="padding:4px 6px;border:1px solid #ccc;font-family:monospace;font-size:11px">${p.codigo_barras}</td>
        <td style="padding:4px 6px;border:1px solid #ccc">${p.nombre}</td>
        <td style="padding:4px 6px;border:1px solid #ccc;text-align:center">${p.stock}</td>
        <td style="padding:4px 6px;border:1px solid #ccc;text-align:center">${p.cantidad_necesaria}</td>
        <td style="padding:4px 6px;border:1px solid #ccc;text-align:center"></td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Lista de Compras</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; padding: 20px; color: #1f2937; }
  h1 { font-size: 18px; margin: 0 0 4px; }
  p { font-size: 11px; color: #6b7280; margin: 0 0 16px; }
  table { width: 100%; border-collapse: collapse; }
  th { background: #059669; color: #fff; padding: 6px 8px; font-size: 11px; text-align: left; }
  td { padding: 4px 6px; border: 1px solid #d1d5db; font-size: 11px; }
  .total { margin-top: 12px; font-size: 11px; color: #6b7280; }
  .firma { margin-top: 40px; border-top: 1px solid #d1d5db; padding-top: 4px; font-size: 10px; color: #9ca3af; }
</style></head><body>
  <h1>Lista de Compras</h1>
  <p>${fecha} — Productos con stock menor a ${STOCK_MINIMO} unidades</p>
  <table><thead><tr>
    <th style="text-align:center;width:32px">#</th>
    <th>Código</th>
    <th>Producto</th>
    <th style="text-align:center">Stock</th>
    <th style="text-align:center">Pedir</th>
    <th style="text-align:center;width:60px">Precio</th>
  </tr></thead><tbody>${filas}</tbody></table>
  <p class="total">${productos.length} producto${productos.length !== 1 ? 's' : ''} para reponer</p>
  <div class="firma">Firma del encargado: ___________________________</div>
</body></html>`;

    const printWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    await printWin.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
    printWin.webContents.print({ silent: false, printBackground: true }, (success) => {
      printWin.close();
      if (!success) log.warn('[stockPrint] Impresión cancelada o falló');
    });
    return true;
  } catch (err) {
    log.error('[stockPrint] Error al imprimir:', err);
    return false;
  }
}
