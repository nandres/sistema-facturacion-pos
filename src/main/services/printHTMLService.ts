import { BrowserWindow, app } from 'electron';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { obtenerImpresoraConfig } from './configService';
import { formatearGsConPrefijo } from '../../shared/formato/guarani';
import { lineaRuc } from '../../shared/config/comercio';
import { obtenerComercio } from './configService';

// Mismo formato que el ticket ESC/POS y que la pantalla: una sola definicion.
const formatearGs = formatearGsConPrefijo;

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface DatosTicketHTML {
  id_venta: number;
  fecha_hora: string;
  total_pagado: number;
  monto_recibido: number;
  vuelto: number;
  tipo_pago: string;
  lineas: { nombre: string; cantidad: number; precio_unitario: number }[];
  ivaPorTasa?: Record<number, number>;
}

export function generarTicketHTML(datos: DatosTicketHTML): string {
  // Se lee al imprimir, no al cargar el modulo: los datos del comercio se
  // configuran por instalacion y pueden cambiar sin reiniciar la app.
  const comercio = obtenerComercio();
  const STORE = escapeHtml(comercio.nombre);
  const RUC = escapeHtml(lineaRuc(comercio.ruc));
  const fecha = new Date(datos.fecha_hora).toLocaleString('es-PY', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });

  const lineasHTML = datos.lineas.map(l => {
    const cant = String(l.cantidad).padStart(3);
    const prec = formatearGs(l.precio_unitario);
    return `${escapeHtml(l.nombre.slice(0, 18))}${' '.repeat(Math.max(1, 22 - escapeHtml(l.nombre.slice(0, 18)).length))}${cant.padStart(6)}${prec.padStart(14)}`;
  }).join('<br>');

  let ivaHTML = '';
  if (datos.ivaPorTasa && Object.keys(datos.ivaPorTasa).length > 0) {
    ivaHTML = Object.entries(datos.ivaPorTasa).map(([tasa, monto]) =>
      `<br>IVA ${tasa}%${' '.repeat(24)}${formatearGs(monto).padStart(14)}`
    ).join('');
  }

  const vueltoLinea = datos.vuelto > 0
    ? `<br>Vuelto${' '.repeat(23)}<b>${formatearGs(datos.vuelto)}</b>`
    : '';

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Ticket</title>
<style>
* { margin:0; padding:0; }
body { font-family:'Courier New',monospace; font-size:10px; color:black; background:white; width:170px; padding:4px; line-height:1.3; }
b { font-weight:bold; }
hr { border:none; border-top:1px dashed black; margin:3px 0; height:1px; background:none; }
@media print { @page { size:58mm auto; margin:0; } body { margin:0; padding:2px; } }
</style></head><body>
<div style="text-align:center;font-weight:bold;font-size:13px;margin-bottom:2px">${STORE}</div>
<div style="text-align:center;font-size:9px">${RUC}</div>
<hr>
<div>Ticket: ${String(datos.id_venta).padStart(7,'0')}</div>
<div>Fecha: ${fecha}</div>
<div>Pago: ${escapeHtml(datos.tipo_pago)}</div>
${datos.vuelto > 0 ? `<div>Vuelto: ${formatearGs(datos.vuelto)}</div>` : ''}
<hr>
<div style="font-weight:bold">ARTICULO${' '.repeat(12)}CANT${' '.repeat(6)}PRECIO</div>
<hr>
<div>${lineasHTML}</div>
<hr>
<div>Items: ${datos.lineas.length}</div>
<div style="font-weight:bold;font-size:12px">TOTAL${' '.repeat(16)}${formatearGs(datos.total_pagado)}</div>
${ivaHTML}
<hr>
<div>Recibido${' '.repeat(20)}${formatearGs(datos.monto_recibido)}</div>
${vueltoLinea}
<div style="text-align:center;font-size:9px;margin-top:4px">Gracias por su compra!<br>Ticket valido como comprobante de venta</div>
</body></html>`;
}

export async function imprimirPagina(html: string, printerName: string): Promise<void> {
  const tmpFile = join(app.getPath('temp'), `print_${Date.now()}.html`);
  writeFileSync(tmpFile, html);
  const win = new BrowserWindow({ show: false, width: 400, height: 600 });

  try {
    await win.loadURL(`file://${tmpFile.replace(/\\/g, '/')}`);
    await new Promise(r => setTimeout(r, 200));

    await new Promise<void>((resolve, reject) => {
      win.webContents.print(
        {
          silent: true,
          printBackground: true,
          deviceName: printerName,
          margins: { marginType: 'none' },
          pageSize: { width: 58_000, height: 200_000 },
          dpi: { horizontal: 203, vertical: 203 },
          copies: 1,
        },
        (success, reason) => {
          if (success) resolve();
          else reject(new Error(reason || 'Error al imprimir'));
        },
      );
    });
  } finally {
    win.destroy();
    try { unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

export async function imprimirTicketHTML(datos: DatosTicketHTML): Promise<void> {
  const printerName = obtenerImpresoraConfig();
  if (!printerName) throw new Error('No hay impresora configurada');
  await imprimirPagina(generarTicketHTML(datos), printerName);
}
