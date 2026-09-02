import { useEffect, useState } from 'react';
import type { Cuenta } from '../../shared/types/ventas';
import { formatearGs } from '../utils/formatoGuarani';
import { Aviso, BarraHerramientas, Campo, Etiqueta, Modal, Pestanas, TituloModulo, Vacio } from '../ui';

type Pestana = 'pagar' | 'recibir';

export default function Cuentas(): JSX.Element {
  const [pestana, setPestana] = useState<Pestana>('pagar');
  const [cuentas, setCuentas] = useState<Cuenta[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [modalCrear, setModalCrear] = useState(false);
  const [form, setForm] = useState({ nombreEntidad: '', monto: '', concepto: '', vencimiento: '' });

  async function cargar() {
    setCargando(true);
    setError(null);
    try {
      const r = await window.api.cuentas.listar(pestana);
      if (!r.ok) { setError(r.mensaje); return; }
      setCuentas(r.data);
    } catch { setError('Error al cargar cuentas.'); }
    finally { setCargando(false); }
  }

  useEffect(() => { cargar(); }, [pestana]);

  async function crearCuenta() {
    const monto = parseInt(form.monto) || 0;
    if (monto <= 0) return;
    try {
      const datos: Partial<Cuenta> = {
        [pestana === 'pagar' ? 'proveedor' : 'cliente']: form.nombreEntidad,
        monto,
        saldo: monto,
        concepto: form.concepto,
        fecha_vencimiento: form.vencimiento || null,
      };
      const r = await window.api.cuentas.crear(pestana, datos);
      if (!r.ok) { setError(r.mensaje); return; }
      setMensaje('Cuenta creada.');
      setModalCrear(false);
      setForm({ nombreEntidad: '', monto: '', concepto: '', vencimiento: '' });
      cargar();
    } catch { setError('Error al crear cuenta.'); }
  }

  async function cambiarEstado(id: number, estado: string) {
    try {
      const r = await window.api.cuentas.actualizarEstado(pestana, id, estado, estado === 'pagada' || estado === 'cobrada' ? 0 : undefined);
      if (!r.ok) { setError(r.mensaje); return; }
      setMensaje(`Cuenta ${estado}.`);
      cargar();
    } catch { setError('Error al actualizar cuenta.'); }
  }

  const esPagar = pestana === 'pagar';
  const totalPendiente = cuentas.filter((c) => c.estado === 'pendiente').reduce((s, c) => s + c.saldo, 0);

  return (
    <div className="flex h-full min-h-0 flex-col bg-ui-fondo text-ui-tx">
      <TituloModulo
        derecha={
          <>
            <span>Pendiente</span>
            <span className="num">{formatearGs(totalPendiente)}</span>
          </>
        }
      >
        Cuentas a pagar y cobrar
      </TituloModulo>

      <Pestanas
        activa={pestana}
        onCambiar={setPestana}
        opciones={[
          { valor: 'pagar', etiqueta: 'A pagar' },
          { valor: 'recibir', etiqueta: 'A cobrar' },
        ]}
      />

      <BarraHerramientas
        acciones={
          <button
            type="button"
            onClick={() => { setForm({ nombreEntidad: '', monto: '', concepto: '', vencimiento: '' }); setModalCrear(true); }}
            className="ui-boton sel"
          >
            Nueva cuenta
          </button>
        }
      >
        <span className="text-[11px] text-ui-txs">
          {esPagar ? 'Lo que el comercio le debe a sus proveedores.' : 'Lo que le deben al comercio.'}
        </span>
      </BarraHerramientas>

      {error && <div className="shrink-0 px-2 pt-2"><Aviso tono="peligro">{error}</Aviso></div>}
      {mensaje && <div className="shrink-0 px-2 pt-2"><Aviso tono="ok">{mensaje}</Aviso></div>}

      <div className="min-h-0 flex-1 overflow-auto bg-ui-sup">
        {cargando ? (
          <Vacio>Cargando…</Vacio>
        ) : cuentas.length === 0 ? (
          <Vacio>No hay cuentas {esPagar ? 'a pagar' : 'a cobrar'}.</Vacio>
        ) : (
          <table className="ui-grilla">
            <thead>
              <tr>
                <th>{esPagar ? 'Proveedor' : 'Cliente'}</th>
                <th className="w-36 der">Monto (Gs.)</th>
                <th className="w-36 der">Saldo (Gs.)</th>
                <th className="w-64">Concepto</th>
                <th className="w-32">Vencimiento</th>
                <th className="w-28 cen">Estado</th>
                <th className="w-24 cen">Acción</th>
              </tr>
            </thead>
            <tbody>
              {cuentas.map((c) => {
                const vencida = c.estado === 'pendiente' && c.fecha_vencimiento && new Date(c.fecha_vencimiento) < new Date();
                return (
                  <tr key={c.id_cuenta}>
                    <td className="font-medium">{c.proveedor ?? c.cliente ?? '—'}</td>
                    <td className="num text-right">{formatearGs(c.monto)}</td>
                    <td className="num text-right font-bold">{formatearGs(c.saldo)}</td>
                    <td className="text-ui-txs">{c.concepto || '—'}</td>
                    <td className={`num ${vencida ? 'font-bold text-ui-pel' : ''}`}>
                      {c.fecha_vencimiento ? new Date(c.fecha_vencimiento).toLocaleDateString('es-PY') : '—'}
                    </td>
                    <td className="text-center">
                      <Etiqueta tono={c.estado === 'pendiente' ? (vencida ? 'peligro' : 'alerta') : 'ok'}>
                        {vencida ? 'vencida' : c.estado}
                      </Etiqueta>
                    </td>
                    <td className="!p-0 text-center">
                      {c.estado === 'pendiente' && (
                        <button
                          type="button"
                          onClick={() => cambiarEstado(c.id_cuenta, esPagar ? 'pagada' : 'cobrada')}
                          className="ui-boton !min-h-[18px] !px-2 !text-[11px]"
                        >
                          {esPagar ? 'Pagar' : 'Cobrar'}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {modalCrear && (
        <Modal
          titulo={`Nueva cuenta a ${esPagar ? 'pagar' : 'cobrar'}`}
          ancho="w-[400px]"
          onCerrar={() => setModalCrear(false)}
          pie={
            <>
              <button type="button" onClick={() => setModalCrear(false)} className="ui-boton">Cancelar</button>
              <button type="button" onClick={crearCuenta} disabled={!form.nombreEntidad || !form.monto} className="ui-boton pri">
                Guardar
              </button>
            </>
          }
        >
          <div
            className="space-y-2 p-3"
            onKeyDown={(e) => { if (e.key === 'Enter' && form.nombreEntidad && form.monto) crearCuenta(); }}
          >
            <Campo rotulo={esPagar ? 'Proveedor' : 'Cliente'}>
              <input
                value={form.nombreEntidad}
                onChange={(e) => setForm({ ...form, nombreEntidad: e.target.value })}
                className="ui-campo uppercase"
                autoFocus
              />
            </Campo>
            <Campo rotulo="Monto (Gs.)">
              <input
                type="number"
                value={form.monto}
                onChange={(e) => setForm({ ...form, monto: e.target.value })}
                className="ui-campo num text-right"
              />
            </Campo>
            <Campo rotulo="Concepto (opcional)">
              <input value={form.concepto} onChange={(e) => setForm({ ...form, concepto: e.target.value })} className="ui-campo" />
            </Campo>
            <Campo rotulo="Vence el">
              <input
                type="date"
                value={form.vencimiento}
                onChange={(e) => setForm({ ...form, vencimiento: e.target.value })}
                className="ui-campo num"
              />
            </Campo>
          </div>
        </Modal>
      )}
    </div>
  );
}
