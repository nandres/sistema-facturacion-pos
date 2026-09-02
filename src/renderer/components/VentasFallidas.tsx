import { useState, useEffect, Fragment } from 'react';
import { Modal, Aviso, Vacio } from '../ui';
import { formatearGs } from '../utils/formatoGuarani';
import type { VentaFallida } from '../../shared/types/ventas';

/**
 * Las ventas que la sincronización no pudo registrar.
 *
 * Son ventas que el comercio **ya cobró** y cuya mercadería **ya salió del
 * local**: la caja las tomó sin conexión, la cola las reintentó cinco veces y
 * la base las rechazó todas. Hasta ahora se archivaban en el JSON local y no
 * había forma de verlas desde la aplicación, así que la plata quedaba
 * registrada en ningún lado.
 *
 * Buena parte de estos fallos son permanentes --stock que otra caja ya vendió,
 * un producto dado de baja-- y reintentar no los arregla: hay que mirarlos y
 * cargarlos a mano. Por eso la única forma de descartar una es el botón, que
 * lo aprieta una persona después de haberla cargado.
 */
export default function VentasFallidas({ onCerrar, onCambio }: {
  onCerrar: () => void;
  onCambio?: () => void;
}): JSX.Element {
  const [fallidas, setFallidas] = useState<VentaFallida[]>([]);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function cargar(): Promise<void> {
    const r = await window.api.offline.ventasFallidas();
    if (!r.ok) { setError(r.mensaje); setCargando(false); return; }
    setFallidas(r.data);
    setCargando(false);
  }

  useEffect(() => { void cargar(); }, []);

  async function descartar(idTemp: string): Promise<void> {
    const r = await window.api.offline.olvidarFallida(idTemp);
    if (!r.ok) { setError(r.mensaje); return; }
    await cargar();
    onCambio?.();
  }

  const totalPendiente = fallidas.reduce((s, v) => s + v.payload.cabecera.total_pagado, 0);

  return (
    <Modal titulo="Ventas que no se pudieron registrar" ancho="w-[720px]" onCerrar={onCerrar}>
      <div className="flex flex-col gap-2 p-3">
        <Aviso tono="peligro">
          Estas ventas ya se cobraron y la mercadería ya salió. La base las rechazó
          después de cinco intentos, así que hay que cargarlas a mano desde la caja
          y recién entonces darlas por resueltas acá.
        </Aviso>

        {error && <Aviso tono="alerta">{error}</Aviso>}

        {cargando ? (
          <Vacio>Cargando…</Vacio>
        ) : fallidas.length === 0 ? (
          <Vacio>No hay ventas sin registrar. Todo lo que se cobró está en la base.</Vacio>
        ) : (
          <>
            <div className="flex items-baseline justify-between border-b border-ui-bd pb-1">
              <span className="text-[12px] text-ui-txs">
                {fallidas.length} venta{fallidas.length === 1 ? '' : 's'} sin registrar
              </span>
              <span className="num text-[13px] font-bold text-ui-pel">
                {formatearGs(totalPendiente)}
              </span>
            </div>

            <table className="ui-grilla">
              <thead>
                <tr>
                  <th>Cobrada el</th>
                  <th className="cen">Ítems</th>
                  <th className="der">Total</th>
                  <th>Motivo del rechazo</th>
                  <th className="cen">Acción</th>
                </tr>
              </thead>
              <tbody>
                {fallidas.map((v) => (
                  <Fragment key={v.idTemp}>
                    <tr
                      onClick={() => setAbierta(abierta === v.idTemp ? null : v.idTemp)}
                      className="cursor-pointer"
                    >
                      <td className="num">{new Date(v.fecha).toLocaleString('es-PY')}</td>
                      <td className="cen num">{v.payload.lineas.length}</td>
                      <td className="der num font-bold">{formatearGs(v.payload.cabecera.total_pagado)}</td>
                      <td className="text-[11px] text-ui-pel" title={v.ultimoError}>
                        {v.ultimoError.length > 60 ? `${v.ultimoError.slice(0, 60)}…` : v.ultimoError}
                      </td>
                      <td className="cen">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); void descartar(v.idTemp); }}
                          title="Solo después de haberla cargado a mano en la caja"
                          className="ui-boton !min-h-[20px] !text-[10.5px]"
                        >
                          Ya la cargué
                        </button>
                      </td>
                    </tr>
                    {abierta === v.idTemp && (
                      <tr>
                        <td colSpan={5} className="!bg-ui-hund">
                          <div className="flex flex-col gap-1 px-2 py-1.5">
                            <span className="text-[10px] uppercase tracking-wide text-ui-txt">
                              Detalle para cargar a mano
                            </span>
                            {v.payload.lineas.map((l, i) => (
                              <div key={i} className="num flex justify-between text-[12px]">
                                <span>{l.codigo_barras}</span>
                                <span className="text-ui-txs">
                                  {l.cantidad} × {formatearGs(l.precio_unitario)}
                                </span>
                              </div>
                            ))}
                            <div className="num flex justify-between border-t border-ui-bd pt-1 text-[12px]">
                              <span className="text-ui-txs">
                                {v.payload.cabecera.tipo_pago} · recibido {formatearGs(v.payload.cabecera.monto_recibido)}
                              </span>
                              <span className="text-ui-txt">
                                descartada el {new Date(v.descartadaEn).toLocaleString('es-PY')}
                              </span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </Modal>
  );
}
