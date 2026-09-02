import { useEffect, useState } from 'react';
import type { Arqueo, MovimientoCaja } from '../../shared/types/ventas';
import { formatearGs } from '../utils/formatoGuarani';
import { Aviso, BarraHerramientas, Caja, Campo, Etiqueta, Fila, Modal, Pestanas, TituloModulo, Vacio } from '../ui';
import ArqueoCaja, { HistorialArqueos } from './ArqueoCaja';

type Pestana = 'turno' | 'cierre' | 'historial';

interface Props {
  idUsuario: number;
  /** Se imprime en el ticket Z del cierre. */
  nombreCajero?: string;
}

export default function CajaControl({ idUsuario, nombreCajero }: Props): JSX.Element {
  const [arqueo, setArqueo] = useState<Arqueo | null>(null);
  const [movimientos, setMovimientos] = useState<MovimientoCaja[]>([]);
  const [efectivoVendido, setEfectivoVendido] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [pestana, setPestana] = useState<Pestana>('turno');
  const [modal, setModal] = useState<'abrir' | 'entrada' | 'retirada' | null>(null);
  const [montoInput, setMontoInput] = useState('');
  const [conceptoInput, setConceptoInput] = useState('');

  async function cargarEstado() {
    setCargando(true);
    setError(null);
    try {
      const r = await window.api.caja.arqueoAbierto(idUsuario);
      if (!r.ok) { setError(r.mensaje); return; }

      setArqueo(r.data);
      if (!r.data) {
        setMovimientos([]);
        setEfectivoVendido(0);
        return;
      }

      const [rm, rv] = await Promise.all([
        window.api.caja.listarMovimientos(r.data.id_arqueo),
        // El efectivo del turno se suma de las ventas, no de
        // `arqueo.total_efectivo`: esa columna nace en 0 y recien la llena
        // `cerrar_caja` al cerrar el turno, asi que mientras la caja esta
        // abierta vale 0 y el esperado saldria sin ninguna venta adentro.
        //
        // El filtro replica el de la RPC salvo en un punto: `listar` filtra
        // `id_usuario = N` y la RPC toma tambien las ventas con `id_usuario`
        // nulo. Si quedan ventas viejas sin usuario, el esperado de pantalla
        // sale por debajo del que calcula el cierre.
        window.api.ventas.listar(r.data.fecha_apertura, undefined, idUsuario),
      ]);
      if (rm.ok) setMovimientos(rm.data);
      if (rv.ok) {
        // Se suma `v.efectivo`, no el total de las ventas marcadas como
        // efectivo: una venta mixta aporta solo su parte en efectivo y una
        // fiada no aporta nada. Es el mismo criterio que usa `cerrar_caja`.
        setEfectivoVendido(
          rv.data
            .filter((v) => v.estado === 'activa')
            .reduce((s, v) => s + v.efectivo, 0),
        );
      }
    } catch { setError('Error al cargar estado de caja.'); }
    finally { setCargando(false); }
  }

  useEffect(() => { cargarEstado(); }, []);

  async function abrirCaja() {
    try {
      const r = await window.api.caja.abrir(parseInt(montoInput) || 0, idUsuario);
      if (!r.ok) { setError(r.mensaje); return; }
      setArqueo(r.data);
      setMovimientos([]);
      setEfectivoVendido(0);
      setMensaje(`Caja abierta — fondo inicial: ${formatearGs(r.data.fondo_inicial)}`);
      setModal(null);
      setMontoInput('');
      setPestana('turno');
    } catch { setError('Error al abrir caja.'); }
  }

  async function registrarMov(tipo: 'entrada' | 'retirada') {
    if (!arqueo) return;
    try {
      const r = await window.api.caja.registrarMovimiento(arqueo.id_arqueo, tipo, parseInt(montoInput) || 0, conceptoInput);
      if (!r.ok) { setError(r.mensaje); return; }
      setMensaje(`${tipo === 'entrada' ? 'Entrada' : 'Retirada'} de ${formatearGs(r.data.monto)} registrada.`);
      setModal(null);
      setMontoInput('');
      setConceptoInput('');
      cargarEstado();
    } catch { setError('Error al registrar movimiento.'); }
  }

  if (cargando) return <div className="flex h-full items-center justify-center text-ui-txt">Cargando…</div>;

  const totalEntradas = movimientos.filter((m) => m.tipo === 'entrada').reduce((a, m) => a + m.monto, 0);
  const totalRetiradas = movimientos.filter((m) => m.tipo === 'retirada').reduce((a, m) => a + m.monto, 0);

  const abierta = arqueo !== null && arqueo.estado === 'abierta';
  const esperadoEnCaja = arqueo
    ? arqueo.fondo_inicial + efectivoVendido + totalEntradas - totalRetiradas
    : 0;

  const tituloModal = modal === 'abrir' ? 'Apertura de caja'
    : modal === 'entrada' ? 'Entrada de efectivo'
      : 'Retiro de efectivo';

  const confirmarModal = () => {
    if (modal === 'abrir') abrirCaja();
    else if (modal === 'entrada') registrarMov('entrada');
    else if (modal === 'retirada') registrarMov('retirada');
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-ui-fondo text-ui-tx">
      <TituloModulo
        derecha={<Etiqueta tono={abierta ? 'ok' : 'neutro'}>{abierta ? 'Caja abierta' : 'Caja cerrada'}</Etiqueta>}
      >
        Apertura y arqueo de caja
      </TituloModulo>

      <Pestanas
        activa={pestana}
        onCambiar={setPestana}
        opciones={[
          { valor: 'turno', etiqueta: 'Turno actual' },
          { valor: 'cierre', etiqueta: 'Cierre y arqueo' },
          { valor: 'historial', etiqueta: 'Historial de arqueos' },
        ]}
      />

      <BarraHerramientas
        acciones={
          pestana === 'historial' ? undefined : abierta ? (
            <>
              <button type="button" onClick={() => { setMontoInput(''); setConceptoInput(''); setModal('entrada'); }} className="ui-boton">
                Entrada de efectivo
              </button>
              <button type="button" onClick={() => { setMontoInput(''); setConceptoInput(''); setModal('retirada'); }} className="ui-boton">
                Retiro de efectivo
              </button>
              {pestana !== 'cierre' && (
                <button type="button" onClick={() => setPestana('cierre')} className="ui-boton pel">
                  Cerrar caja
                </button>
              )}
            </>
          ) : (
            <button type="button" onClick={() => { setMontoInput(''); setModal('abrir'); }} className="ui-boton pri">
              Abrir caja
            </button>
          )
        }
      >
        <span className="text-[11px] text-ui-txs">
          {abierta && arqueo
            ? `Turno abierto el ${new Date(arqueo.fecha_apertura).toLocaleString('es-PY')}.`
            : 'Abrí la caja antes de la primera venta del turno.'}
        </span>
      </BarraHerramientas>

      {error && <div className="shrink-0 px-2 pt-2"><Aviso tono="peligro">{error}</Aviso></div>}
      {mensaje && <div className="shrink-0 px-2 pt-2"><Aviso tono="ok">{mensaje}</Aviso></div>}

      {pestana === 'turno' && (
        !abierta || !arqueo ? (
          <Vacio>No hay ninguna caja abierta en este puesto.</Vacio>
        ) : (
          <div className="min-h-0 flex-1 overflow-auto p-2">
            <div className="grid grid-cols-[320px_1fr] gap-3">
              <Caja titulo="Resumen del turno" cuerpoClassName="p-2">
                <Fila etiqueta="Fondo inicial" valor={formatearGs(arqueo.fondo_inicial)} />
                <Fila etiqueta="Efectivo vendido" valor={formatearGs(efectivoVendido)} />
                <Fila etiqueta="Entradas" valor={formatearGs(totalEntradas)} tono="ok" />
                <Fila etiqueta="Retiros" valor={formatearGs(totalRetiradas)} tono="peligro" />
                <div className="my-1.5 border-t border-ui-bd" />
                <Fila etiqueta="Esperado en caja" valor={formatearGs(esperadoEnCaja)} fuerte grande />
              </Caja>

              <Caja titulo="Movimientos del turno" cuerpoClassName="p-0">
                {movimientos.length === 0 ? (
                  <Vacio>Sin movimientos registrados en este turno.</Vacio>
                ) : (
                  <table className="ui-grilla">
                    <thead>
                      <tr>
                        <th className="w-28">Tipo</th>
                        <th className="w-36 der">Monto (Gs.)</th>
                        <th>Concepto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movimientos.map((m) => (
                        <tr key={m.id_movimiento}>
                          <td>
                            <Etiqueta tono={m.tipo === 'entrada' ? 'ok' : 'peligro'}>
                              {m.tipo === 'entrada' ? 'Entrada' : 'Retiro'}
                            </Etiqueta>
                          </td>
                          <td className={`num text-right font-bold ${m.tipo === 'entrada' ? 'text-ui-ok' : 'text-ui-pel'}`}>
                            {m.tipo === 'entrada' ? '+' : '−'}{formatearGs(m.monto)}
                          </td>
                          <td className="text-ui-txs">{m.concepto || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Caja>
            </div>
          </div>
        )
      )}

      {pestana === 'cierre' && (
        !arqueo ? (
          <Vacio>Abrí la caja para poder arquearla al final del turno.</Vacio>
        ) : (
          <ArqueoCaja
            arqueo={arqueo}
            idUsuario={idUsuario}
            efectivoVendido={efectivoVendido}
            entradas={totalEntradas}
            retiros={totalRetiradas}
            nombreCajero={nombreCajero}
            onCerrado={(cerrado) => {
              setArqueo(cerrado);
              setMensaje(`Caja #${cerrado.id_arqueo} cerrada.`);
            }}
            onVolver={() => { setPestana('turno'); cargarEstado(); }}
          />
        )
      )}

      {pestana === 'historial' && <HistorialArqueos />}

      {modal && (
        <Modal
          titulo={tituloModal}
          ancho="w-[400px]"
          onCerrar={() => setModal(null)}
          pie={
            <>
              <button type="button" onClick={() => setModal(null)} className="ui-boton">Cancelar</button>
              <button type="button" onClick={confirmarModal} className="ui-boton pri">Confirmar</button>
            </>
          }
        >
          <div
            className="space-y-2 p-3"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); confirmarModal(); } }}
          >
            <Campo rotulo={modal === 'abrir' ? 'Fondo inicial (Gs.)' : 'Monto (Gs.)'}>
              <input
                type="number"
                value={montoInput}
                onChange={(e) => setMontoInput(e.target.value)}
                className="ui-campo num !h-[30px] text-right !text-[15px] font-bold"
                autoFocus
              />
            </Campo>

            {(modal === 'entrada' || modal === 'retirada') && (
              <Campo rotulo="Concepto (opcional)">
                <input
                  type="text"
                  value={conceptoInput}
                  onChange={(e) => setConceptoInput(e.target.value)}
                  className="ui-campo"
                />
              </Campo>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
