import { spawn } from 'child_process';
import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';
import { app } from 'electron';
import { obtenerImpresoraConfig, obtenerPuertoImpresoraCache, recordarPuertoImpresora, olvidarPuertoImpresora, obtenerComercio } from './configService';
import { imprimirTicketHTML, imprimirPagina } from './printHTMLService';
import { formatearGs } from '../../shared/formato/guarani';
import { lineaRuc } from '../../shared/config/comercio';
import type { DatosTicketZ } from '../../shared/types/ventas';

const PAPER_WIDTH = 32;

// La cabecera del comprobante se lee **en el momento de imprimir**, no al
// cargar el modulo: los datos del comercio son configurables por instalacion y
// pueden cambiar sin reiniciar la app.
function cabeceraComercio(): { nombre: string; ruc: string } {
  const c = obtenerComercio();
  return { nombre: c.nombre, ruc: lineaRuc(c.ruc) };
}

function normalizar(texto: string): string {
  const tabla: Record<string, string> = {
    á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u',
    Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U',
    ñ: 'n', Ñ: 'N',
    // Los signos de apertura tambien se van. `ln()` los escribe tal cual --0xA1
    // y 0xBF-- y la ticketera, que arranca en CP437, imprime `i` y `+`: el
    // ticket salia con "iGracias por su compra!". No es acento, pero es el
    // mismo problema, y el lugar de arreglarlo es este.
    '¡': '', '¿': '',
  };
  return texto.replace(/[áéíóúñÁÉÍÓÚÑ¡¿]/g, (c) => tabla[c] ?? c);
}

function centrar(texto: string): string {
  const t = normalizar(texto);
  if (t.length >= PAPER_WIDTH) return t.slice(0, PAPER_WIDTH);
  return ' '.repeat(Math.floor((PAPER_WIDTH - t.length) / 2)) + t;
}

function der(izquierda: string, derecha: string): string {
  const i = normalizar(izquierda).slice(0, 16);
  const d = normalizar(derecha).slice(0, 14);
  const espacios = PAPER_WIDTH - i.length - d.length;
  return i + ' '.repeat(Math.max(0, espacios)) + d;
}

function sep(car = '-'): string {
  return car.repeat(PAPER_WIDTH);
}

/**
 * La fila de rotulos de la planilla de articulos.
 *
 * Estaba escrita a mano y medía **35 columnas sobre un papel de 32**, así que
 * envolvía en todos los tickets impresos: `PRECIO` caía solo en la línea
 * siguiente. Las filas de datos sí estaban bien calculadas; la cabecera era un
 * literal que nadie había medido.
 *
 * Ahora sale del mismo ancho que las filas --3 de cantidad, 4 de separación, la
 * descripción, 1 espacio y 6 de precio-- así que no puede volver a irse.
 */
function cabeceraColumnas(): string {
  const anchoPrecio = 'PRECIO'.length;
  const anchoDesc = PAPER_WIDTH - 4 - 3 - 1 - anchoPrecio;
  return 'CANT' + ' '.repeat(3) + 'ARTICULO'.padEnd(anchoDesc) + ' ' + 'PRECIO';
}

// Lo que atrapa un catch es `unknown`: puede venir cualquier cosa, no solo un
// Error. Esto saca el mensaje sin tener que anotar `any` en cada catch --que
// es lo que apaga el chequeo de tipos justo donde algo ya salio mal--.
function mensajeDeError(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

// ESC/POS commands
const ESC = 0x1B, GS = 0x1D;

function cmd(...b: number[]): Buffer {
  return Buffer.from(b);
}

function ln(texto: string): Buffer {
  return Buffer.concat([Buffer.from(texto + '\n', 'ascii')]);
}

// Genera un código EAN-13 con prefijo 200 + identificador único de 9 dígitos
export function generarCodigoEAN13(seed?: number): string {
  const timestamp = seed ?? Date.now();
  const base = `200${String(timestamp).slice(-9).padStart(9, '0')}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(base[i], 10) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return base + check;
}

export function construirEtiquetaCodigo(datos: { codigo: string; nombre: string; precio: number }): Buffer {
  const bufs: Buffer[] = [];
  bufs.push(cmd(ESC, 0x40)); // init
  bufs.push(ln(''));
  bufs.push(ln(centrar(datos.nombre.slice(0, 24))));
  bufs.push(ln(centrar(`Gs. ${formatearGs(datos.precio)}`)));
  bufs.push(ln(''));

  // GS k m n d1...dn — EAN-13 (m=73), n=13 bytes
  const code = datos.codigo;
  bufs.push(cmd(GS, 0x6B, 73, code.length));
  for (let i = 0; i < code.length; i++) {
    bufs.push(cmd(code.charCodeAt(i)));
  }
  bufs.push(ln(''));
  bufs.push(ln(centrar(datos.codigo)));
  bufs.push(ln(''));
  bufs.push(cmd(GS, 0x56, 0x00)); // cut
  return Buffer.concat(bufs);
}

export function construirTicket(datos: {
  id_venta: number;
  fecha_hora: string;
  total_pagado: number;
  monto_recibido: number;
  vuelto: number;
  tipo_pago: string;
  lineas: { nombre: string; cantidad: number; precio_unitario: number }[];
  ivaPorTasa?: Record<number, number>;
}): Buffer {
  const bufs: Buffer[] = [];

  const comercio = cabeceraComercio();
  bufs.push(cmd(ESC, 0x40));                // initialize
  bufs.push(cmd(GS, 0x21, 0x11));           // double height
  bufs.push(ln(centrar(comercio.nombre)));  // store name
  bufs.push(cmd(GS, 0x21, 0x00));           // normal size
  if (comercio.ruc) bufs.push(ln(centrar(comercio.ruc)));
  bufs.push(cmd(ESC, 0x61, 0x00));          // left align
  bufs.push(ln(''));

  const fecha = new Date(datos.fecha_hora).toLocaleString('es-PY', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  bufs.push(ln(`Ticket: ${String(datos.id_venta).padStart(7, '0')}`));
  bufs.push(ln(`Fecha:  ${fecha}`));
  bufs.push(ln(`Pago:   ${datos.tipo_pago}`));
  if (datos.vuelto > 0) {
    bufs.push(ln(`Vuelto: ${formatearGs(datos.vuelto)}`));
  }
  bufs.push(ln(''));

  // items header
  bufs.push(ln(sep('=')));
  bufs.push(ln(cabeceraColumnas()));
  bufs.push(ln(sep('-')));

  for (const l of datos.lineas) {
    const cant = String(l.cantidad).padStart(3, ' ');
    const prec = formatearGs(l.precio_unitario);
    // 3 (cantidad) + 4 (separacion) + descripcion + 1 (espacio) + precio
    // = PAPER_WIDTH. La descripcion cede ancho si el precio es largo, para no
    // pasarse de las 32 columnas y que la linea envuelva en el papel. El
    // espacio antes del precio siempre se respeta: sin el, "COCA COLA 2L" y
    // "20.000" quedan pegados y el ticket se lee mal.
    const anchoDesc = Math.max(1, PAPER_WIDTH - 3 - 4 - 1 - prec.length);
    const desc = normalizar(l.nombre).slice(0, anchoDesc).padEnd(anchoDesc, ' ');
    bufs.push(ln(`${cant}    ${desc} ${prec}`));
  }

  bufs.push(ln(sep('=')));
  bufs.push(ln(''));

  // totals
  bufs.push(ln(der('Subtotal:', formatearGs(datos.total_pagado))));
  bufs.push(cmd(ESC, 0x45, 0x01));          // bold on
  bufs.push(ln(der('TOTAL:', formatearGs(datos.total_pagado))));
  bufs.push(cmd(ESC, 0x45, 0x00));          // bold off

  // IVA desglose
  if (datos.ivaPorTasa && Object.keys(datos.ivaPorTasa).length > 0) {
    bufs.push(ln(sep('-')));
    for (const [tasa, monto] of Object.entries(datos.ivaPorTasa)) {
      bufs.push(ln(der(`IVA ${tasa}%:`, formatearGs(monto))));
    }
  }

  bufs.push(ln(sep('-')));
  bufs.push(ln(der('Recibido:', formatearGs(datos.monto_recibido))));
  bufs.push(cmd(ESC, 0x45, 0x01));
  bufs.push(ln(der('Vuelto:', formatearGs(datos.vuelto))));
  bufs.push(cmd(ESC, 0x45, 0x00));

  bufs.push(ln(''));
  bufs.push(ln(centrar('¡Gracias por su compra!')));
  bufs.push(ln(centrar('Ticket válido como')));
  bufs.push(ln(centrar('comprobante de venta')));
  bufs.push(ln(''));

  bufs.push(cmd(GS, 0x56, 0x00));           // full cut
  bufs.push(cmd(ESC, 0x70, 0x00, 0x30, 0xFF)); // cash drawer

  return Buffer.concat(bufs);
}

export function construirNotaCredito(datos: {
  id_venta: number;
  fecha_hora: string;
  total_pagado: number;
  tipo_pago: string;
  lineas: { nombre: string; cantidad: number; precio_unitario: number }[];
}): Buffer {
  const bufs: Buffer[] = [];
  bufs.push(cmd(ESC, 0x40));
  bufs.push(cmd(GS, 0x21, 0x11));
  const comercio = cabeceraComercio();
  bufs.push(ln(centrar('NOTA DE CRÉDITO')));
  bufs.push(cmd(GS, 0x21, 0x00));
  bufs.push(ln(centrar(comercio.nombre)));
  if (comercio.ruc) bufs.push(ln(centrar(comercio.ruc)));
  bufs.push(cmd(ESC, 0x61, 0x00));
  bufs.push(ln(''));

  const fecha = new Date(datos.fecha_hora).toLocaleString('es-PY', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  // Rotulo de 14 columnas: `Fecha:` con el ancho anterior daba 6 + 11 + 17 =
  // 34 sobre un papel de 32, asi que la fecha envolvia a la linea siguiente y
  // la nota salia con un `:30` suelto colgando. Con 14 las dos entran y siguen
  // alineadas: 14 + 7 = 21 y 14 + 17 = 31.
  bufs.push(ln(`Ticket orig.: ${String(datos.id_venta).padStart(7, '0')}`));
  bufs.push(ln(`Fecha:        ${fecha}`));
  bufs.push(ln(''));
  bufs.push(ln(der('Total devuelto:', formatearGs(datos.total_pagado))));
  bufs.push(ln(''));
  bufs.push(ln(centrar('Productos devueltos:')));
  bufs.push(ln(sep('-')));
  for (const l of datos.lineas) {
    const cant = String(l.cantidad).padStart(3, ' ');
    const prec = formatearGs(l.precio_unitario);
    // 3 (cantidad) + 4 (separacion) + descripcion + 1 (espacio) + precio
    // = PAPER_WIDTH. La descripcion cede ancho si el precio es largo, para no
    // pasarse de las 32 columnas y que la linea envuelva en el papel. El
    // espacio antes del precio siempre se respeta: sin el, "COCA COLA 2L" y
    // "20.000" quedan pegados y el ticket se lee mal.
    const anchoDesc = Math.max(1, PAPER_WIDTH - 3 - 4 - 1 - prec.length);
    const desc = normalizar(l.nombre).slice(0, anchoDesc).padEnd(anchoDesc, ' ');
    bufs.push(ln(`${cant}    ${desc} ${prec}`));
  }
  bufs.push(ln(sep('=')));
  bufs.push(ln(''));
  bufs.push(ln(centrar('Devolución registrada')));
  bufs.push(ln(centrar('Stock repuesto automáticamente')));
  bufs.push(ln(''));
  bufs.push(cmd(GS, 0x56, 0x00));
  bufs.push(cmd(ESC, 0x70, 0x00, 0x30, 0xFF));
  return Buffer.concat(bufs);
}

/* ─────────────────────────────────────────────────────────────────────────
   Ticket Z — cierre de caja.

   No pasa por construirTicket(): un arqueo no tiene lineas de articulo, y
   meterlo ahi imprimia el reporte dentro de la columna de descripcion, con
   los rotulos cortados a 15 caracteres y un "TOTAL" de venta al pie.
   ───────────────────────────────────────────────────────────────────────── */

// El rotulo ocupa 15 columnas fijas y el importe se alinea a la derecha en las
// 17 restantes. Con 32 columnas de papel entran enteros los rotulos mas largos
// --"Transferencia:" y "Fondo inicial:", de 14-- sin que ninguno se corte, y
// del otro lado entra cualquier importe que la caja pueda mover.
const ROTULO_Z = 15;

function filaZ(rotulo: string, valor: string): string {
  const r = normalizar(rotulo).slice(0, ROTULO_Z).padEnd(ROTULO_Z);
  const hueco = PAPER_WIDTH - ROTULO_Z;
  return r + normalizar(valor).slice(0, hueco).padStart(hueco);
}

// "27/08/2026 21:14". Sin la coma que mete toLocaleString: con ella la fecha
// ocupa las 17 columnas justas del hueco de filaZ() y no queda margen, asi que
// cualquier ICU que formatee un caracter de mas se comeria los minutos.
function fechaZ(iso: string | null): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('es-PY', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).replace(',', '');
}

export function construirTicketZ(datos: DatosTicketZ): Buffer {
  const bufs: Buffer[] = [];

  bufs.push(cmd(ESC, 0x40));                // initialize
  bufs.push(cmd(GS, 0x21, 0x11));           // double height
  bufs.push(ln(centrar('CIERRE DE CAJA')));
  bufs.push(cmd(GS, 0x21, 0x00));           // normal size
  bufs.push(ln(centrar('- TICKET Z -')));
  const comercio = cabeceraComercio();
  bufs.push(ln(centrar(comercio.nombre)));
  if (comercio.ruc) bufs.push(ln(centrar(comercio.ruc)));
  bufs.push(cmd(ESC, 0x61, 0x00));          // left align
  bufs.push(ln(sep('=')));

  bufs.push(ln(filaZ('Caja:', String(datos.id_arqueo).padStart(7, '0'))));
  if (datos.cajero) bufs.push(ln(filaZ('Cajero:', datos.cajero)));
  bufs.push(ln(filaZ('Apertura:', fechaZ(datos.fecha_apertura))));
  bufs.push(ln(filaZ('Cierre:', fechaZ(datos.fecha_cierre))));

  bufs.push(ln(sep('-')));
  bufs.push(ln(centrar('VENTAS DEL TURNO')));
  bufs.push(ln(sep('-')));
  bufs.push(ln(filaZ('Efectivo:', formatearGs(datos.total_efectivo))));
  bufs.push(ln(filaZ('Tarjeta:', formatearGs(datos.total_tarjeta))));
  bufs.push(ln(filaZ('Transferencia:', formatearGs(datos.total_transferencia))));
  bufs.push(ln(filaZ('Mixto:', formatearGs(datos.total_mixto))));
  bufs.push(cmd(ESC, 0x45, 0x01));          // bold on
  bufs.push(ln(filaZ('TOTAL VENTAS:', formatearGs(datos.total_ventas))));
  bufs.push(cmd(ESC, 0x45, 0x00));          // bold off

  bufs.push(ln(sep('-')));
  bufs.push(ln(centrar('MOVIMIENTOS DE CAJA')));
  bufs.push(ln(sep('-')));
  bufs.push(ln(filaZ('Entradas:', `+${formatearGs(datos.entradas)}`)));
  bufs.push(ln(filaZ('Retiros:', `-${formatearGs(datos.retiros)}`)));

  bufs.push(ln(sep('-')));
  bufs.push(ln(centrar('ARQUEO')));
  bufs.push(ln(sep('-')));
  bufs.push(ln(filaZ('Fondo inicial:', formatearGs(datos.fondo_inicial))));
  bufs.push(ln(filaZ('Esperado:', formatearGs(datos.esperado))));
  bufs.push(ln(filaZ('Contado:', formatearGs(datos.declarado))));
  bufs.push(ln(sep('=')));
  bufs.push(cmd(ESC, 0x45, 0x01));
  bufs.push(ln(filaZ('DIFERENCIA:', formatearGs(datos.diferencia))));
  bufs.push(ln(centrar(
    datos.diferencia === 0 ? 'LA CAJA CUADRA'
      : datos.diferencia > 0 ? 'SOBRANTE' : 'FALTANTE',
  )));
  bufs.push(cmd(ESC, 0x45, 0x00));
  bufs.push(ln(sep('=')));

  bufs.push(ln(''));
  bufs.push(ln(''));
  bufs.push(ln(centrar('............................')));
  bufs.push(ln(centrar('Firma del cajero')));
  bufs.push(ln(''));

  bufs.push(cmd(GS, 0x56, 0x00));           // full cut
  // Sin pulso de cajon, a diferencia del ticket de venta y de la nota de
  // credito: al cierre la plata ya se conto con el cajon abierto, y el Z se
  // reimprime desde el historial. Abrirlo de nuevo solo deja el cajon abierto
  // cuando el ticket sale sin nadie delante.
  return Buffer.concat(bufs);
}

function obtenerNombreImpresora(): string | null {
  return obtenerImpresoraConfig();
}

export async function imprimirNotaCredito(datos: {
  id_venta: number;
  fecha_hora: string;
  total_pagado: number;
  tipo_pago: string;
  lineas: { nombre: string; cantidad: number; precio_unitario: number }[];
}): Promise<void> {
  await enviarAImpresora(construirNotaCredito(datos));
}

export async function imprimirTicketZ(datos: DatosTicketZ): Promise<void> {
  const ticket = construirTicketZ(datos);
  // Sin impresora configurada el Z se guarda en disco en vez de perderse: es
  // el comprobante del cierre y sin el no queda rastro en papel del turno.
  if (!obtenerNombreImpresora()) {
    const dir = path.join(app.getPath('userData'), 'arqueos');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `arqueo_z_${datos.id_arqueo}.bin`), ticket);
    return;
  }
  await enviarAImpresora(ticket);
}

export async function imprimirTicket(datos: {
  id_venta: number;
  fecha_hora: string;
  total_pagado: number;
  monto_recibido: number;
  vuelto: number;
  tipo_pago: string;
  lineas: { nombre: string; cantidad: number; precio_unitario: number }[];
  ivaPorTasa?: Record<number, number>;
}): Promise<void> {
  const printerName = obtenerImpresoraConfig();
  if (!printerName) {
    const dir = path.join(app.getPath('userData'), 'tickets');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `ticket_${datos.id_venta}.bin`), construirTicket(datos));
    return;
  }

  // Método 1: ESC/POS directo al puerto (como DACS, funciona con Generic/Text Only)
  try {
    await enviarAImpresora(construirTicket(datos));
    return;
  } catch (e) {
    console.warn('[print] ESC/POS falló, intentando HTML:', mensajeDeError(e));
  }

  // Método 2: HTML vía driver de Windows (fallback para drivers gráficos)
  try {
    await imprimirTicketHTML(datos);
  } catch (e) {
    throw new Error(`No se pudo imprimir.\n${mensajeDeError(e)}`);
  }
}

export async function imprimirEtiquetaCodigo(datos: { codigo: string; nombre: string; precio: number }): Promise<void> {
  const printerName = obtenerNombreImpresora();
  const ticket = construirEtiquetaCodigo(datos);
  if (!printerName) {
    const dir = path.join(app.getPath('userData'), 'etiquetas');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `etiqueta_${datos.codigo}.bin`), ticket);
    return;
  }
  await enviarAImpresora(ticket);
}

function ejecutarPS(comando: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const ps = spawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', comando]);
    let out = '', err = '';
    ps.stdout.on('data', (d: Buffer) => { out += d.toString(); });
    ps.stderr.on('data', (d: Buffer) => { err += d.toString(); });
    ps.on('close', (code) => code === 0 ? resolve(out.trim()) : reject(new Error(err || `Código ${code}`)));
    ps.on('error', reject);
  });
}

async function escribirAPuerto(puerto: string, data: Buffer): Promise<void> {
  const tmpFile = path.join(app.getPath('temp'), `print_${Date.now()}.bin`);
  writeFileSync(tmpFile, data);
  const s = (x: string) => x.replace(/'/g, "''");
  try {
    await ejecutarPS(
      `$b = [System.IO.File]::ReadAllBytes('${s(tmpFile)}'); ` +
      `$fs = New-Object System.IO.FileStream('\\\\.\\${s(puerto)}', ` +
      `[System.IO.FileMode]::Open, [System.IO.FileAccess]::Write, [System.IO.FileShare]::ReadWrite); ` +
      `try { $fs.Write($b, 0, $b.Length) } finally { $fs.Close() }; ` +
      `Remove-Item '${s(tmpFile)}'`,
    );
  } finally {
    try { unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

async function obtenerPuertoImpresora(nombre: string): Promise<string | null> {
  try {
    const out = await ejecutarPS(
      `Get-CimInstance Win32_Printer -Filter "Name='${nombre.replace(/'/g, "''")}'" | Select-Object -ExpandProperty PortName`,
    );
    return out.replace(/:$/, '') || null;
  } catch { return null; }
}

async function enviarAImpresora(data: Buffer): Promise<void> {
  const printerName = obtenerNombreImpresora();
  if (!printerName) throw new Error('No hay impresora configurada');

  // Camino rapido: el puerto que contesto la ultima vez. Es el caso normal
  // --una ticketera USB fija no se muda de puerto-- y deja la impresion en un
  // solo arranque de PowerShell, en vez de la consulta WMI mas hasta once
  // intentos que se pagaban en cada venta.
  const cacheado = obtenerPuertoImpresoraCache();
  if (cacheado) {
    try {
      await escribirAPuerto(cacheado, data);
      return;
    } catch (e) {
      const motivo = mensajeDeError(e);
      console.warn(`[print] el puerto cacheado ${cacheado} no respondio, vuelvo a buscar:`, motivo);
      olvidarPuertoImpresora();
    }
  }

  // Busqueda completa: primero el que declara WMI, luego USB001-005, LPT1-2, COM1-3
  const puertos: string[] = [];
  const detectado = await obtenerPuertoImpresora(printerName);
  if (detectado) puertos.push(detectado);
  for (let i = 1; i <= 5; i++) {
    const p = `USB00${i}`;
    if (!puertos.includes(p)) puertos.push(p);
  }
  for (const p of ['LPT1', 'LPT2', 'COM1', 'COM2', 'COM3']) {
    if (!puertos.includes(p)) puertos.push(p);
  }

  let ultimoError = '';
  for (const puerto of puertos) {
    try {
      await escribirAPuerto(puerto, data);
      recordarPuertoImpresora(puerto);
      return;
    } catch (e) {
      ultimoError += `\n${puerto}: ${mensajeDeError(e)}`;
    }
  }

  // Fallback: Write-Printer
  try {
    const tmpFile = path.join(app.getPath('temp'), `print_${Date.now()}.bin`);
    writeFileSync(tmpFile, data);
    const s = (x: string) => x.replace(/'/g, "''");
    await ejecutarPS(
      `$b = [System.IO.File]::ReadAllBytes('${s(tmpFile)}'); ` +
      `Write-Printer -Name '${s(printerName)}' -Data $b; ` +
      `Remove-Item '${s(tmpFile)}'`,
    );
    try { unlinkSync(tmpFile); } catch { /* ignore */ }
  } catch (e) {
    throw new Error(`No se pudo imprimir.\nPuertos:${ultimoError}\nWrite-Printer: ${mensajeDeError(e)}`);
  }
}

export async function testImpresora(): Promise<void> {
  const printerName = obtenerNombreImpresora();
  if (!printerName) {
    const dir = path.join(app.getPath('userData'), 'tickets');
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, `test_${Date.now()}.txt`), 'No hay impresora configurada');
    return;
  }

  // Método 1: ESC/POS directo al puerto
  try {
    const testData = Buffer.concat([
      Buffer.from([0x1B, 0x40]),
      Buffer.from('\n\nPRUEBA DE IMPRESION\n' + '='.repeat(32) + '\nFecha: ' + new Date().toLocaleString('es-PY') + '\n\n\n\n', 'ascii'),
    ]);
    await enviarAImpresora(testData);
    return;
  } catch (e) {
    console.warn('[test] ESC/POS falló, probando HTML:', mensajeDeError(e));
  }

  // Método 2: HTML vía driver
  try {

    const testHTML = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Prueba</title>
<style>
* { margin:0; padding:0; }
body { font-family:'Courier New',monospace; font-size:12px; color:black; background:white; width:170px; padding:4px; text-align:center; }
@media print { @page { size:58mm auto; margin:0; } body { margin:0; padding:2px; } }
</style></head><body>
<h2>PRUEBA DE IMPRESION</h2>
<hr>
<p>Fecha: ${new Date().toLocaleString('es-PY')}</p>
<p>Impresora: ${printerName}</p>
<hr>
<p>Si ves esto, la impresora funciona correctamente.</p>
</body></html>`;
    await imprimirPagina(testHTML, printerName);
  } catch (e) {
    throw new Error(`No se pudo imprimir.\n${mensajeDeError(e)}`);
  }
}
