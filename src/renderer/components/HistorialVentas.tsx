import { useEffect, useState } from 'react';
import type { VentaResumen, VentaDetalle, VentaDetalleLinea } from '../../shared/types/ventas';
import { formatearGs, formatearGsConPrefijo } from '../utils/formatoGuarani';
import { Aviso, BarraHerramientas, Caja, Etiqueta, TituloModulo, Vacio } from '../ui';
import { puedeAnular } from '../../shared/roles';
import type { DevolucionConDetalle } from '../../shared/types/productos';

type Vista = 'lista' | 'detalle';

interface Props {
  idUsuario: number;
  rol: string;
}

// La forma de lo que devuelve `devoluciones.listar` ahora vive en shared, con
// el resto del contrato de `window.api`. Se sigue leyendo a la defensiva: los
// campos son opcionales porque vienen de un select con relacion anidada.
type FilaDevolucion = DevolucionConDetalle;

// Cuanto se devolvio ya de cada codigo. Se acumula por codigo de barras porque
// esa es la clave con la que el servicio de devoluciones repone stock y decide
// si la venta quedo entera devuelta.
function sumarDevuelto(filas: FilaDevolucion[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const dev of filas ?? []) {
    for (const d of dev?.detalle_devoluciones ?? []) {
      const codigo = d?.codigo_barras;
      const cant = Number(d?.cantidad ?? 0);
      if (!codigo || !Number.isFinite(cant)) continue;
      acc[codigo] = (acc[codigo] ?? 0) + cant;
    }
  }
  return acc;
}

export default function HistorialVentas({ idUsuario, rol }: Props): JSX.Element {
  const [ventas, setVentas] = useState<VentaResumen[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>('lista');
  const [detalle, setDetalle] = useState<VentaDetalle | null>(null);
  const [modoDevolucion, setModoDevolucion] = useState(false);
  const [devolverCantidades, setDevolverCantidades] = useState<Record<number, number>>({});
  const [procesandoDevolucion, setProcesandoDevolucion] = useState(false);
  // Lo ya devuelto de la venta abierta. Sin esto la pantalla vuelve a ofrecer
  // lo que ya se devolvio: repone stock dos veces y saca dos notas de credito
  // por la misma mercaderia.
  const [devueltoPorCodigo, setDevueltoPorCodigo] = useState<Record<string, number>>({});
  const [devueltoGs, setDevueltoGs] = useState(0);
  const [exportando, setExportando] = useState(false);

  async function cargarVentas() {
    setCargando(true);
    setError(null);
    try {
      const r = await window.api.ventas.listar(undefined, undefined, idUsuario);
      if (!r.ok) { setError(r.mensaje); return; }
      setVentas(r.data);
    } catch (err) {
      setError('Error al cargar ventas.');
      console.error(err);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargarVentas(); }, []);

  async function verDetalle(idVenta: number) {
    setCargando(true);
    setError(null);
    // El modo devolucion es de la venta que se estaba mirando. Si no se limpia
    // al abrir otra, la siguiente se abre en modo devolucion y arrastra las
    // cantidades de la anterior.
    setModoDevolucion(false);
    setDevolverCantidades({});
    setDevueltoPorCodigo({});
    setDevueltoGs(0);
    try {
      const [r, rd] = await Promise.all([
        window.api.ventas.detalle(idVenta),
        window.api.devoluciones.listar(idVenta),
      ]);
      if (!r.ok) { setError(r.mensaje); return; }
      if (!r.data) { setError('Venta no encontrada.'); return; }
      setDetalle(r.data);
      if (rd.ok) {
        const filas: FilaDevolucion[] = rd.data ?? [];
        setDevueltoPorCodigo(sumarDevuelto(filas));
        setDevueltoGs(filas.reduce((s, f) => s + Number(f?.total_devuelto ?? 0), 0));
      }
      setVista('detalle');
    } catch (err) {
      setError('Error al obtener detalle.');
      console.error(err);
    } finally {
      setCargando(false);
    }
  }

  function volverALista() {
    setModoDevolucion(false);
    setDevolverCantidades({});
    setVista('lista');
  }

  // Lo que todavia se puede devolver de una linea: lo vendido menos lo ya
  // devuelto de ese codigo.
  function restanteDeLinea(l: VentaDetalleLinea): number {
    return Math.max(0, l.cantidad - (devueltoPorCodigo[l.codigo_barras] ?? 0));
  }

  async function reimprimir(det: VentaDetalle) {
    try {
      const r = await window.api.ticket.imprimir({
        id_venta: det.venta.id_venta,
        fecha_hora: det.venta.fecha_hora,
        total_pagado: det.venta.total_pagado,
        monto_recibido: det.venta.monto_recibido,
        vuelto: det.venta.vuelto,
        tipo_pago: det.venta.tipo_pago,
        lineas: det.lineas.map((l) => ({
          nombre: l.nombre,
          cantidad: l.cantidad,
          precio_unitario: l.precio_unitario,
        })),
      });
      if (r.ok) setMensaje('Reimpresión enviada.');
      else setError(r.mensaje);
    } catch (err) {
      setError('Error al reimprimir.');
      console.error(err);
    }
  }

  async function anular(idVenta: number) {
    if (!window.confirm('¿Anular esta venta? Se repondrá el stock automáticamente.')) return;
    try {
      const r = await window.api.ventas.anular(idVenta);
      if (!r.ok) { setError(r.mensaje); return; }
      setMensaje(`Venta #${idVenta} anulada.`);
      setVista('lista');
      cargarVentas();
    } catch (err) {
      setError('Error al anular.');
      console.error(err);
    }
  }

  function devolver(det: VentaDetalle) {
    const cantInicial: Record<number, number> = {};
    for (const l of det.lineas) {
      const restante = restanteDeLinea(l);
      if (restante > 0) cantInicial[l.id_detalle] = restante;
    }
    if (Object.keys(cantInicial).length === 0) {
      setError('Esta venta ya fue devuelta por completo.');
      return;
    }
    setError(null);
    setModoDevolucion(true);
    setDevolverCantidades(cantInicial);
  }

  async function confirmarDevolucion() {
    if (!detalle) return;
    const lineasADevolver = detalle.lineas
      .filter((l) => (devolverCantidades[l.id_detalle] ?? 0) > 0)
      .map((l) => ({
        codigo_barras: l.codigo_barras,
        cantidad: devolverCantidades[l.id_detalle],
        precio_unitario: l.precio_unitario,
      }));
    if (lineasADevolver.length === 0) {
      setError('Seleccioná al menos un producto para devolver.');
      return;
    }
    const totalDev = lineasADevolver.reduce((s, l) => s + l.cantidad * l.precio_unitario, 0);
    if (!window.confirm(`¿Devolver ${lineasADevolver.length} línea(s) por ${formatearGsConPrefijo(totalDev)}? Se emitirá una Nota de Crédito y se repondrá el stock.`)) return;
    setProcesandoDevolucion(true);
    try {
      const r = await window.api.devoluciones.crear({
        id_venta: detalle.venta.id_venta,
        id_usuario: idUsuario,
        motivo: 'Devolución parcial desde interfaz',
        lineas: lineasADevolver,
      });
      if (!r.ok) { setError(r.mensaje); return; }
      await window.api.ticket.notaCredito({
        id_venta: detalle.venta.id_venta,
        fecha_hora: detalle.venta.fecha_hora,
        total_pagado: totalDev,
        monto_recibido: 0,
        vuelto: 0,
        tipo_pago: detalle.venta.tipo_pago,
        lineas: detalle.lineas
          .filter((l) => (devolverCantidades[l.id_detalle] ?? 0) > 0)
          .map((l) => ({
            nombre: l.nombre,
            cantidad: devolverCantidades[l.id_detalle],
            precio_unitario: l.precio_unitario,
          })),
      });
      setMensaje(`Devolución #${r.data.id_devolucion} registrada. Nota de Crédito impresa.`);
      volverALista();
      cargarVentas();
    } catch (err) {
      setError('Error al procesar devolución.');
      console.error(err);
    } finally {
      setProcesandoDevolucion(false);
    }
  }

  async function exportarExcel() {
    setExportando(true);
    setError(null);
    setMensaje(null);
    try {
      // El libro lo arma el proceso main con exceljs; aca solo se pide.
      //
      // Antes esta funcion tenia 274 lineas que calculaban a mano cada estilo
      // de celda con la API de SheetJS. La version community de SheetJS
      // **ignora los estilos**, asi que todo ese trabajo terminaba en un
      // archivo en blanco y negro. Ademas escribia las formulas como SUMA() y
      // CONTARA(), en espanol, y dentro del .xlsx las formulas van siempre en
      // ingles: esas celdas llegaban rotas.
      const r = await window.api.archivo.exportarVentas(undefined, undefined, idUsuario);
      if (!r.ok) { setError(r.mensaje); return; }
      if (r.data.ventas === 0) { setError('No hay ventas para exportar.'); return; }
      if (r.data.guardado) setMensaje(`Excel exportado: ${r.data.ventas} ventas.`);
      // guardado === false: el usuario cancelo el dialogo de guardado.
    } catch (err) {
      setError('Error al exportar Excel: ' + (err instanceof Error ? err.message : String(err)));
      console.error(err);
    } finally {
      setExportando(false);
    }
  }

  if (vista === 'detalle' && detalle) {
    const v = detalle.venta;
    const totalDevolucion = detalle.lineas.reduce((s, l) => s + (devolverCantidades[l.id_detalle] ?? 0) * l.precio_unitario, 0);
    const hayDevueltos = devueltoGs > 0 || Object.values(devueltoPorCodigo).some((c) => c > 0);
    const quedaPorDevolver = detalle.lineas.some((l) => restanteDeLinea(l) > 0);

    return (
      <div className="flex h-full min-h-0 flex-col bg-ui-fondo text-ui-tx">
        <TituloModulo
          derecha={
            <>
              <span className="num">N.º {String(v.id_venta).padStart(7, '0')}</span>
              <Etiqueta tono={v.estado === 'anulada' ? 'peligro' : 'ok'}>{v.estado}</Etiqueta>
            </>
          }
        >
          Detalle de venta
        </TituloModulo>

        <BarraHerramientas
          acciones={
            modoDevolucion ? (
              <>
                <button type="button" onClick={() => { setModoDevolucion(false); setDevolverCantidades({}); }} className="ui-boton">
                  Cancelar devolución
                </button>
                <button
                  type="button"
                  onClick={confirmarDevolucion}
                  disabled={procesandoDevolucion || Object.values(devolverCantidades).every((c) => c === 0)}
                  className="ui-boton pri"
                >
                  {procesandoDevolucion ? 'Procesando…' : `Confirmar ${formatearGsConPrefijo(totalDevolucion)}`}
                </button>
              </>
            ) : (
              <>
                <button type="button" onClick={() => reimprimir(detalle)} className="ui-boton">Reimprimir ticket</button>
                {/* Anular y devolver son operaciones de administrador: la base
                    ya las reserva con `anular_venta_sesion`. Ocultarlas evita
                    que el cajero apriete un botón que termina en un error de
                    permisos. Ver src/shared/roles.ts. */}
                {v.estado === 'activa' && puedeAnular(rol) && (
                  <>
                    <button
                      type="button"
                      onClick={() => devolver(detalle)}
                      disabled={!quedaPorDevolver}
                      title={quedaPorDevolver ? undefined : 'Ya se devolvió todo lo vendido en esta venta.'}
                      className="ui-boton"
                    >
                      Nota de crédito
                    </button>
                    <button type="button" onClick={() => anular(v.id_venta)} className="ui-boton pel">Anular venta</button>
                  </>
                )}
              </>
            )
          }
        >
          <button type="button" onClick={volverALista} className="ui-boton">← Volver al listado</button>
        </BarraHerramientas>

        <div className={`grid shrink-0 gap-2 p-2 ${hayDevueltos ? 'grid-cols-6' : 'grid-cols-5'}`}>
          <Caja titulo="Fecha" cuerpoClassName="px-2 py-1.5">
            <div className="num text-[12.5px]">{new Date(v.fecha_hora).toLocaleString('es-PY')}</div>
          </Caja>
          <Caja titulo="Forma de pago" cuerpoClassName="px-2 py-1.5">
            <div className="text-[12.5px] capitalize">{v.tipo_pago}</div>
          </Caja>
          <Caja titulo="Total" cuerpoClassName="px-2 py-1.5">
            <div className="num text-[15px] font-bold">{formatearGs(v.total_pagado)}</div>
          </Caja>
          <Caja titulo="Recibido" cuerpoClassName="px-2 py-1.5">
            <div className="num text-[12.5px]">{formatearGs(v.monto_recibido)}</div>
          </Caja>
          <Caja titulo="Vuelto" cuerpoClassName="px-2 py-1.5">
            <div className="num text-[12.5px]">{formatearGs(v.vuelto)}</div>
          </Caja>
          {hayDevueltos && (
            <Caja titulo="Devuelto" cuerpoClassName="px-2 py-1.5">
              <div className="num text-[15px] font-bold text-ui-pel">−{formatearGs(devueltoGs)}</div>
            </Caja>
          )}
        </div>

        {modoDevolucion && (
          <div className="px-2 pb-2">
            <Aviso tono="alerta">
              Marcá las líneas a devolver y ajustá la cantidad. Se emite una nota de crédito por {formatearGsConPrefijo(totalDevolucion)}.
            </Aviso>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-auto border-t border-ui-bdf bg-ui-sup">
          <table className="ui-grilla">
            <thead>
              <tr>
                {modoDevolucion && <th className="w-9 cen">Dev.</th>}
                <th className="w-36">Código</th>
                <th>Producto</th>
                <th className="w-20 der">Cant.</th>
                {hayDevueltos && <th className="w-24 der">Devuelto</th>}
                <th className="w-32 der">Precio unit.</th>
                <th className="w-32 der">Subtotal</th>
                {modoDevolucion && <th className="w-28 der">A devolver</th>}
              </tr>
            </thead>
            <tbody>
              {detalle.lineas.map((l) => {
                const devCant = devolverCantidades[l.id_detalle] ?? 0;
                const yaDevuelto = Math.min(l.cantidad, devueltoPorCodigo[l.codigo_barras] ?? 0);
                const restante = restanteDeLinea(l);
                return (
                  <tr key={l.id_detalle} className={modoDevolucion && devCant > 0 ? 'sel' : ''}>
                    {modoDevolucion && (
                      <td className="text-center">
                        <input
                          type="checkbox"
                          checked={devCant > 0}
                          disabled={restante === 0}
                          title={restante === 0 ? 'Esta línea ya fue devuelta.' : undefined}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setDevolverCantidades((prev) => ({ ...prev, [l.id_detalle]: restante }));
                            } else {
                              const next = { ...devolverCantidades };
                              delete next[l.id_detalle];
                              setDevolverCantidades(next);
                            }
                          }}
                        />
                      </td>
                    )}
                    <td className="num text-ui-txs">{l.codigo_barras}</td>
                    <td>{l.nombre}</td>
                    <td className="num text-right">{l.cantidad}</td>
                    {hayDevueltos && (
                      <td className={`num text-right ${yaDevuelto > 0 ? 'font-bold text-ui-pel' : 'text-ui-txt'}`}>
                        {yaDevuelto > 0 ? yaDevuelto : '—'}
                      </td>
                    )}
                    <td className="num text-right">{formatearGs(l.precio_unitario)}</td>
                    <td className="num text-right font-bold">{formatearGs(l.precio_unitario * l.cantidad)}</td>
                    {modoDevolucion && (
                      <td className="!p-0">
                        {devCant > 0 && (
                          <div className="flex items-center justify-end gap-px pr-1">
                            <button
                              type="button"
                              onClick={() => setDevolverCantidades((prev) => ({ ...prev, [l.id_detalle]: Math.max(0, (prev[l.id_detalle] ?? 0) - 1) }))}
                              className="h-[18px] w-[18px] border border-ui-bd bg-ui-sup text-[12px] font-bold leading-none text-ui-txs hover:bg-ui-alta"
                            >
                              −
                            </button>
                            <span className="num w-7 text-center text-[12px] font-bold">{devCant}</span>
                            <button
                              type="button"
                              onClick={() => setDevolverCantidades((prev) => ({ ...prev, [l.id_detalle]: Math.min(restante, (prev[l.id_detalle] ?? 0) + 1) }))}
                              className="h-[18px] w-[18px] border border-ui-bd bg-ui-sup text-[12px] font-bold leading-none text-ui-txs hover:bg-ui-alta"
                            >
                              +
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {(error || mensaje) && (
          <div className="shrink-0 border-t border-ui-bd">
            <Aviso tono={error ? 'peligro' : 'ok'}>{error ?? mensaje}</Aviso>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-ui-fondo text-ui-tx">
      <TituloModulo derecha={<span className="num">{ventas.length} ventas</span>}>
        Historial de ventas
      </TituloModulo>

      <BarraHerramientas
        acciones={
          <>
            <button type="button" onClick={exportarExcel} disabled={exportando || ventas.length === 0} className="ui-boton">
              {exportando ? 'Exportando…' : 'Exportar a Excel'}
            </button>
            <button type="button" onClick={cargarVentas} className="ui-boton">Actualizar</button>
          </>
        }
      >
        <span className="text-[11px] text-ui-txs">
          Doble clic o «Detalle» para abrir una venta, reimprimir el ticket o emitir una nota de crédito.
        </span>
      </BarraHerramientas>

      {error && <div className="shrink-0 px-2 pt-2"><Aviso tono="peligro">{error}</Aviso></div>}
      {mensaje && <div className="shrink-0 px-2 pt-2"><Aviso tono="ok">{mensaje}</Aviso></div>}

      <div className="min-h-0 flex-1 overflow-auto border-t border-ui-bdf bg-ui-sup">
        {cargando ? (
          <Vacio>Cargando ventas…</Vacio>
        ) : ventas.length === 0 ? (
          <Vacio>No hay ventas registradas.</Vacio>
        ) : (
          <table className="ui-grilla">
            <thead>
              <tr>
                <th className="w-24 der">N.º</th>
                <th className="w-52">Fecha y hora</th>
                <th className="w-36 der">Total (Gs.)</th>
                <th className="w-32">Forma de pago</th>
                <th className="w-24 cen">Estado</th>
                <th></th>
                <th className="w-24 cen">Acción</th>
              </tr>
            </thead>
            <tbody>
              {ventas.map((v) => (
                <tr key={v.id_venta} onDoubleClick={() => verDetalle(v.id_venta)}>
                  <td className="num text-right text-ui-txs">{String(v.id_venta).padStart(7, '0')}</td>
                  <td className="num">{new Date(v.fecha_hora).toLocaleString('es-PY')}</td>
                  <td className="num text-right font-bold">{formatearGs(v.total_pagado)}</td>
                  <td className="capitalize">{v.tipo_pago}</td>
                  <td className="text-center">
                    <Etiqueta tono={v.estado === 'anulada' ? 'peligro' : 'ok'}>{v.estado}</Etiqueta>
                  </td>
                  <td></td>
                  <td className="!p-0 text-center">
                    <button
                      type="button"
                      onClick={() => verDetalle(v.id_venta)}
                      className="ui-boton !min-h-[18px] !px-2 !text-[11px]"
                    >
                      Detalle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
