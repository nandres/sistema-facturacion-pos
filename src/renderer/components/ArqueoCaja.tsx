import { useEffect, useState } from 'react';
import type { Arqueo } from '../../shared/types/ventas';
import { formatearGs } from '../utils/formatoGuarani';
import { Aviso, Caja, Campo, Etiqueta, Fila, Vacio } from '../ui';

type Tono = 'ok' | 'alerta' | 'peligro' | undefined;

// La diferencia se lee como plata que sobra o que falta, no como un numero con
// signo: el cajero tiene que ver de un vistazo si le falta, sin interpretar.
function leerDiferencia(diff: number | null): { texto: string; tono: Tono } {
  if (diff === null) return { texto: '—', tono: undefined };
  if (diff === 0) return { texto: '0 — cuadra', tono: 'ok' };
  if (diff > 0) return { texto: `+${formatearGs(diff)} sobrante`, tono: 'alerta' };
  return { texto: `${formatearGs(diff)} faltante`, tono: 'peligro' };
}

interface Props {
  arqueo: Arqueo;
  idUsuario: number;
  /**
   * Efectivo cobrado desde la apertura del turno. No sale de
   * `arqueo.total_efectivo`: esa columna arranca en 0 y recien la llena
   * `cerrar_caja` al cerrar, asi que mientras el turno esta abierto vale 0.
   * Lo calcula el contenedor sumando las ventas del turno.
   */
  efectivoVendido: number;
  entradas: number;
  retiros: number;
  /** Nombre del cajero, para que salga impreso en el ticket Z. */
  nombreCajero?: string;
  onCerrado: (arqueo: Arqueo) => void;
  onVolver: () => void;
}

export default function ArqueoCaja({
  arqueo,
  idUsuario,
  efectivoVendido,
  entradas,
  retiros,
  nombreCajero,
  onCerrado,
  onVolver,
}: Props): JSX.Element {
  // Los digitos crudos van al estado y el campo muestra el agrupado: el cajero
  // teclea 1250000 y lee 1.250.000, que es como cuenta los billetes.
  const [declaradoTexto, setDeclaradoTexto] = useState('');
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Arqueo | null>(null);
  const [avisoImpresion, setAvisoImpresion] = useState<string | null>(null);

  useEffect(() => {
    setDeclaradoTexto('');
    setError(null);
    setResultado(null);
    setAvisoImpresion(null);
  }, [arqueo.id_arqueo]);

  const esperado = arqueo.fondo_inicial + efectivoVendido + entradas - retiros;

  const declarado = declaradoTexto === '' ? NaN : Number(declaradoTexto);
  const declaradoValido = Number.isFinite(declarado) && declarado >= 0;
  const previa = leerDiferencia(declaradoValido ? declarado - esperado : null);

  async function cerrar() {
    if (!declaradoValido) {
      setError('Ingresá el efectivo contado.');
      return;
    }

    setProcesando(true);
    setError(null);
    try {
      const r = await window.api.caja.cerrar(arqueo.id_arqueo, declarado, idUsuario);
      if (!r.ok) { setError(r.mensaje); return; }
      setResultado(r.data);
      onCerrado(r.data);
    } catch (err) {
      setError('Error al cerrar caja.');
      console.error(err);
    } finally {
      setProcesando(false);
    }
  }

  async function imprimirTicketZ() {
    if (!resultado) return;

    // El arqueo, el esperado y la diferencia salen del resultado de la RPC, no
    // de la cuenta de esta pantalla: el ticket Z es el comprobante de lo que
    // quedo guardado en la base, y tiene que decir lo mismo.
    try {
      const r = await window.api.ticket.arqueoZ({
        id_arqueo: resultado.id_arqueo,
        cajero: nombreCajero,
        fecha_apertura: resultado.fecha_apertura,
        fecha_cierre: resultado.fecha_cierre,
        fondo_inicial: resultado.fondo_inicial,
        total_efectivo: resultado.total_efectivo,
        total_tarjeta: resultado.total_tarjeta,
        total_transferencia: resultado.total_transferencia,
        total_mixto: resultado.total_mixto,
        total_ventas: resultado.total_ventas,
        entradas,
        retiros,
        esperado: resultado.esperado_efectivo ?? 0,
        declarado: resultado.fondo_declarado ?? 0,
        diferencia: resultado.diferencia ?? 0,
      });
      if (!r.ok) console.warn('[Ticket Z]', r.mensaje);
      setAvisoImpresion(r.ok ? 'Ticket Z enviado a la impresora.' : r.mensaje);
    } catch (err) {
      console.error('[Ticket Z]', err);
      setAvisoImpresion('No se pudo imprimir el ticket Z.');
    }
  }

  /* ── Caja ya cerrada: el comprobante Z en pantalla ────────────────────── */
  if (resultado) {
    const dif = leerDiferencia(resultado.diferencia);

    // Con la migracion 20260827000001 aplicada, `cerrar_caja` calcula el
    // esperado incluyendo los movimientos del turno y esto da igual. Si la
    // base todavia tiene la version vieja, difiere justo en las entradas y los
    // retiros: en vez de suponer una cosa o la otra, se comparan las dos
    // cuentas y solo se avisa cuando de verdad no coinciden.
    const esperadoLocal = resultado.fondo_inicial + resultado.total_efectivo + entradas - retiros;
    const migracionPendiente = (resultado.esperado_efectivo ?? 0) !== esperadoLocal;
    const difReal = leerDiferencia((resultado.fondo_declarado ?? 0) - esperadoLocal);

    return (
      <div className="min-h-0 flex-1 overflow-auto p-2">
        <div className="grid grid-cols-[minmax(0,360px)_minmax(0,360px)] gap-3">
          <Caja titulo={`Ventas del turno — cierre #${resultado.id_arqueo}`} cuerpoClassName="p-2">
            <Fila etiqueta="Apertura" valor={new Date(resultado.fecha_apertura).toLocaleString('es-PY')} />
            <Fila
              etiqueta="Cierre"
              valor={resultado.fecha_cierre ? new Date(resultado.fecha_cierre).toLocaleString('es-PY') : '—'}
            />
            <div className="my-1.5 border-t border-ui-bd" />
            <Fila etiqueta="Efectivo" valor={formatearGs(resultado.total_efectivo)} />
            <Fila etiqueta="Tarjeta" valor={formatearGs(resultado.total_tarjeta)} />
            <Fila etiqueta="Transferencia" valor={formatearGs(resultado.total_transferencia)} />
            <Fila etiqueta="Mixto" valor={formatearGs(resultado.total_mixto)} />
            <div className="my-1.5 border-t border-ui-bd" />
            <Fila etiqueta="Total vendido" valor={formatearGs(resultado.total_ventas)} fuerte grande />
          </Caja>

          <Caja titulo="Arqueo" cuerpoClassName="p-2">
            <Fila etiqueta="Fondo inicial" valor={formatearGs(resultado.fondo_inicial)} />
            <Fila etiqueta="Esperado en caja" valor={formatearGs(resultado.esperado_efectivo ?? 0)} />
            <Fila etiqueta="Contado por el cajero" valor={formatearGs(resultado.fondo_declarado ?? 0)} />
            <div className="my-1.5 border-t border-ui-bd" />
            <Fila etiqueta="Diferencia" valor={dif.texto} tono={dif.tono} fuerte grande />

            {migracionPendiente && (
              <div className="mt-2">
                <Aviso tono="alerta">
                  La base guardó un esperado de {formatearGs(resultado.esperado_efectivo ?? 0)}, sin
                  descontar las entradas ni los retiros del turno. Contra el cajón real la diferencia
                  es {difReal.texto}. Falta aplicar la migración
                  {' '}<span className="num">20260827000001_cerrar_caja_movimientos</span> en Supabase.
                </Aviso>
              </div>
            )}

            {avisoImpresion && <div className="mt-2"><Aviso tono="info">{avisoImpresion}</Aviso></div>}

            <div className="mt-3 flex gap-1.5">
              <button type="button" onClick={imprimirTicketZ} className="ui-boton pri">Imprimir ticket Z</button>
              <button type="button" onClick={onVolver} className="ui-boton">Volver al turno</button>
            </div>
          </Caja>
        </div>
      </div>
    );
  }

  /* ── Caja abierta: el conteo ──────────────────────────────────────────── */
  return (
    <div className="min-h-0 flex-1 overflow-auto p-2">
      <div className="grid grid-cols-[minmax(0,360px)_minmax(0,360px)] gap-3">
        <Caja titulo="Lo que debería haber en el cajón" cuerpoClassName="p-2">
          <Fila etiqueta="Fondo inicial" valor={formatearGs(arqueo.fondo_inicial)} />
          <Fila etiqueta="Efectivo vendido" valor={formatearGs(efectivoVendido)} />
          <Fila etiqueta="Entradas" valor={`+${formatearGs(entradas)}`} tono="ok" />
          <Fila etiqueta="Retiros" valor={`−${formatearGs(retiros)}`} tono="peligro" />
          <div className="my-1.5 border-t border-ui-bd" />
          <Fila etiqueta="Esperado en caja" valor={formatearGs(esperado)} fuerte grande />
          <p className="mt-2 text-[11px] leading-snug text-ui-txt">
            Turno abierto el {new Date(arqueo.fecha_apertura).toLocaleString('es-PY')}.
          </p>
        </Caja>

        <Caja titulo="Conteo del cajero" cuerpoClassName="p-2">
          <Campo rotulo="Efectivo contado en el cajón (Gs.)">
            <input
              type="text"
              inputMode="numeric"
              value={declaradoTexto === '' ? '' : formatearGs(Number(declaradoTexto))}
              onChange={(e) => setDeclaradoTexto(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => { if (e.key === 'Enter' && declaradoValido && !procesando) cerrar(); }}
              disabled={procesando}
              placeholder="0"
              autoFocus
              className="ui-campo num !h-[34px] text-right !text-[19px] font-bold"
            />
          </Campo>

          <div className="mt-2 border-t border-ui-bd pt-1.5">
            <Fila etiqueta="Esperado" valor={formatearGs(esperado)} />
            <Fila etiqueta="Contado" valor={declaradoValido ? formatearGs(declarado) : '—'} />
            <Fila etiqueta="Diferencia" valor={previa.texto} tono={previa.tono} fuerte grande />
          </div>

          {error && <div className="mt-2"><Aviso tono="peligro">{error}</Aviso></div>}

          <div className="mt-3 flex gap-1.5">
            <button
              type="button"
              onClick={cerrar}
              disabled={procesando || !declaradoValido}
              className="ui-boton pel"
            >
              {procesando ? 'Cerrando…' : 'Cerrar caja'}
            </button>
            <button type="button" onClick={onVolver} className="ui-boton" disabled={procesando}>
              Cancelar
            </button>
          </div>
        </Caja>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Historial de arqueos. Va como pestaña del mismo módulo: es donde se mira
   cómo vinieron cerrando los turnos anteriores.
   ───────────────────────────────────────────────────────────────────────── */
export function HistorialArqueos(): JSX.Element {
  const [arqueos, setArqueos] = useState<Arqueo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await window.api.caja.listarArqueos();
        if (!r.ok) { setError(r.mensaje); return; }
        setArqueos(r.data);
      } catch (err) {
        setError('Error al cargar arqueos.');
        console.error(err);
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  if (cargando) return <Vacio>Cargando arqueos…</Vacio>;
  if (error) return <div className="p-2"><Aviso tono="peligro">{error}</Aviso></div>;
  if (arqueos.length === 0) return <Vacio>No hay arqueos registrados.</Vacio>;

  return (
    <div className="min-h-0 flex-1 overflow-auto border-t border-ui-bdf bg-ui-sup">
      <table className="ui-grilla">
        <thead>
          <tr>
            <th className="w-16 der">N.º</th>
            <th className="w-44">Apertura</th>
            <th className="w-44">Cierre</th>
            <th className="w-32 der">Fondo inicial</th>
            <th className="w-32 der">Total vendido</th>
            <th className="w-32 der">Contado</th>
            <th className="w-44 der">Diferencia</th>
            <th className="w-24 cen">Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {arqueos.map((a) => {
            const dif = leerDiferencia(a.diferencia);
            const tinta = dif.tono === 'ok' ? 'text-ui-ok'
              : dif.tono === 'alerta' ? 'text-ui-ale'
                : dif.tono === 'peligro' ? 'text-ui-pel'
                  : 'text-ui-txt';
            return (
              <tr key={a.id_arqueo}>
                <td className="num text-right text-ui-txs">{a.id_arqueo}</td>
                <td className="num">{new Date(a.fecha_apertura).toLocaleString('es-PY')}</td>
                <td className="num">{a.fecha_cierre ? new Date(a.fecha_cierre).toLocaleString('es-PY') : '—'}</td>
                <td className="num text-right">{formatearGs(a.fondo_inicial)}</td>
                <td className="num text-right font-bold">{formatearGs(a.total_ventas)}</td>
                <td className="num text-right">{a.fondo_declarado === null ? '—' : formatearGs(a.fondo_declarado)}</td>
                <td className={`num text-right font-bold ${tinta}`}>{dif.texto}</td>
                <td className="text-center">
                  <Etiqueta tono={a.estado === 'cerrada' ? 'neutro' : 'ok'}>{a.estado}</Etiqueta>
                </td>
                <td></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
