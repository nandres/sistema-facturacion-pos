import { useState, useEffect } from 'react';
import type { ClienteFiado } from '../../shared/types/ventas';
import { formatearGs } from '../utils/formatoGuarani';
import { Aviso, BarraHerramientas, Caja, Campo, Fila, TituloModulo, Vacio } from '../ui';

export default function Fiado() {
  const [clientes, setClientes] = useState<ClienteFiado[]>([]);
  const [selCliente, setSelCliente] = useState<ClienteFiado | null>(null);
  const [montoPago, setMontoPago] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [tipoMensaje, setTipoMensaje] = useState<'ok' | 'error'>('ok');
  const [showNuevo, setShowNuevo] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');
  const [nuevoRuc, setNuevoRuc] = useState('');
  const [nuevoTel, setNuevoTel] = useState('');
  const [nuevoLimite, setNuevoLimite] = useState('');
  const [confirmarEliminar, setConfirmarEliminar] = useState<number | null>(null);

  useEffect(() => { cargar(); }, []);

  useEffect(() => {
    if (!showNuevo && confirmarEliminar === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Enter' && !e.shiftKey && confirmarEliminar !== null) {
        e.preventDefault();
        eliminarCliente(confirmarEliminar, '');
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (showNuevo) {
          setShowNuevo(false);
          setNuevoNombre(''); setNuevoRuc(''); setNuevoTel(''); setNuevoLimite('');
        }
        if (confirmarEliminar !== null) setConfirmarEliminar(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showNuevo, confirmarEliminar]);

  async function cargar() {
    const r = await window.api.clientes.listar();
    if (r.ok) setClientes(r.data);
  }

  function msg(texto: string, tipo: 'ok' | 'error') {
    setMensaje(texto);
    setTipoMensaje(tipo);
    setTimeout(() => setMensaje(''), 3000);
  }

  async function crearCliente() {
    if (!nuevoNombre.trim()) { msg('Nombre requerido', 'error'); return; }
    const r = await window.api.clientes.crear({
      nombre: nuevoNombre.trim(),
      ruc: nuevoRuc.trim() || undefined,
      telefono: nuevoTel.trim() || undefined,
      limite_credito: parseInt(nuevoLimite.replace(/\./g, '')) || 0,
    });
    if (r.ok) {
      msg('Cliente creado', 'ok');
      setShowNuevo(false);
      setNuevoNombre(''); setNuevoRuc(''); setNuevoTel(''); setNuevoLimite('');
      cargar();
    } else msg(r.mensaje, 'error');
  }

  function eliminarCliente(id: number, nombre?: string) {
    if (confirmarEliminar !== id) { setConfirmarEliminar(id); return; }
    setConfirmarEliminar(null);
    window.api.clientes.eliminar(id).then((r) => {
      if (!r.ok) { msg(r.mensaje, 'error'); return; }
      msg(nombre ? `Cliente "${nombre}" eliminado` : 'Cliente eliminado', 'ok');
      if (selCliente?.id_cliente === id) setSelCliente(null);
      cargar();
    });
  }

  async function pagarDeuda() {
    if (!selCliente) return;
    const monto = parseInt(montoPago.replace(/\./g, ''), 10);
    if (!monto || monto <= 0) { msg('Ingresá un monto válido', 'error'); return; }
    if (monto > selCliente.saldo_deudor) { msg('El monto supera la deuda actual', 'error'); return; }
    const r = await window.api.clientes.registrarAmortizacion(selCliente.id_cliente, monto);
    if (r.ok) {
      msg(`Pago de ${formatearGs(monto)} registrado`, 'ok');
      setMontoPago('');
      cargar();
      const actualizado = await window.api.clientes.listar();
      if (actualizado.ok) {
        setSelCliente(actualizado.data.find((c) => c.id_cliente === selCliente.id_cliente) || null);
      }
    } else msg(r.mensaje, 'error');
  }

  const conCredito = clientes.filter((c) => c.saldo_deudor > 0 || c.limite_credito > 0);
  const deudaTotal = clientes.reduce((s, c) => s + c.saldo_deudor, 0);

  return (
    <div className="flex h-full min-h-0 flex-col bg-ui-fondo text-ui-tx">
      <TituloModulo
        derecha={
          <>
            <span>Deuda total</span>
            <span className="num text-[15px] font-bold">{formatearGs(deudaTotal)}</span>
          </>
        }
      >
        Cuenta corriente de clientes
      </TituloModulo>

      <BarraHerramientas
        acciones={
          <button type="button" onClick={() => setShowNuevo(!showNuevo)} className="ui-boton sel">
            {showNuevo ? 'Cerrar alta' : 'Nuevo cliente'}
          </button>
        }
      >
        <span className="text-[11px] text-ui-txs">
          <b className="num">{conCredito.length}</b> clientes con crédito habilitado.
        </span>
      </BarraHerramientas>

      {mensaje && (
        <div className="shrink-0 px-2 pt-2">
          <Aviso tono={tipoMensaje === 'ok' ? 'ok' : 'peligro'}>{mensaje}</Aviso>
        </div>
      )}

      {showNuevo && (
        <div className="shrink-0 p-2">
          <Caja titulo="Alta de cliente" cuerpoClassName="p-2">
            <div
              className="nuevo-cliente-form grid grid-cols-4 gap-2"
              onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); setShowNuevo(false); } }}
            >
              <Campo rotulo="Nombre *">
                <input className="ui-campo uppercase" value={nuevoNombre} onChange={(e) => setNuevoNombre(e.target.value)} />
              </Campo>
              <Campo rotulo="RUC / C.I.">
                <input className="ui-campo num" value={nuevoRuc} onChange={(e) => setNuevoRuc(e.target.value)} placeholder="12345678-9" />
              </Campo>
              <Campo rotulo="Teléfono">
                <input className="ui-campo num" value={nuevoTel} onChange={(e) => setNuevoTel(e.target.value)} placeholder="+595" />
              </Campo>
              <Campo rotulo="Límite de crédito (Gs.)">
                <input
                  className="ui-campo num text-right"
                  value={nuevoLimite}
                  onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, ''); setNuevoLimite(v ? Number(v).toLocaleString('es-PY') : ''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); crearCliente(); } }}
                />
              </Campo>
            </div>
            <div className="mt-2 flex justify-end gap-1.5">
              <button type="button" onClick={() => setShowNuevo(false)} className="ui-boton">Cancelar</button>
              <button type="button" onClick={crearCliente} className="ui-boton pri">Guardar cliente</button>
            </div>
          </Caja>
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1 overflow-auto border-t border-ui-bdf bg-ui-sup">
          {conCredito.length === 0 ? (
            <Vacio>Sin clientes con crédito habilitado.</Vacio>
          ) : (
            <table className="ui-grilla">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th className="w-40">RUC / C.I.</th>
                  <th className="w-36 der">Deuda (Gs.)</th>
                  <th className="w-36 der">Límite (Gs.)</th>
                  <th className="w-36 der">Disponible (Gs.)</th>
                  <th className="w-40 cen">Acción</th>
                </tr>
              </thead>
              <tbody>
                {conCredito.map((c) => {
                  const disp = c.limite_credito - c.saldo_deudor;
                  return (
                    <tr key={c.id_cliente} className={selCliente?.id_cliente === c.id_cliente ? 'sel' : ''}>
                      <td className="font-medium">{c.nombre}</td>
                      <td className="num text-ui-txs">{c.ruc || '—'}</td>
                      <td className={`num text-right font-bold ${c.saldo_deudor > 0 ? 'text-ui-pel' : 'text-ui-txt'}`}>
                        {formatearGs(c.saldo_deudor)}
                      </td>
                      <td className="num text-right text-ui-txs">{formatearGs(c.limite_credito)}</td>
                      <td className={`num text-right ${disp > 0 ? 'text-ui-ok' : 'text-ui-pel'}`}>{formatearGs(disp)}</td>
                      <td className="!p-0">
                        <div className="flex items-center justify-center gap-1 py-px">
                          {c.saldo_deudor > 0 && (
                            <button type="button" onClick={() => setSelCliente(c)} className="ui-boton !min-h-[18px] !px-2 !text-[11px]">
                              Cobrar
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => eliminarCliente(c.id_cliente, c.nombre)}
                            title="Eliminar cliente"
                            className={`ui-boton !min-h-[18px] !px-2 !text-[11px] ${confirmarEliminar === c.id_cliente ? 'pel' : ''}`}
                          >
                            {confirmarEliminar === c.id_cliente ? '¿Confirmar?' : 'Eliminar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {selCliente && (
          <aside className="w-72 shrink-0 border-l border-ui-bdf p-2">
            <Caja titulo="Cobro de deuda" cuerpoClassName="p-2">
              <div className="mb-2 flex items-start justify-between gap-2">
                <span className="text-[12.5px] font-bold uppercase leading-tight">{selCliente.nombre}</span>
                <button
                  type="button"
                  onClick={() => setSelCliente(null)}
                  aria-label="Cerrar"
                  className="px-1 text-[13px] leading-none text-ui-txt hover:text-ui-tx"
                >
                  ✕
                </button>
              </div>

              <Fila etiqueta="Deuda actual" valor={formatearGs(selCliente.saldo_deudor)} tono="peligro" fuerte />
              <Fila etiqueta="Límite" valor={formatearGs(selCliente.limite_credito)} />
              <Fila etiqueta="Disponible" valor={formatearGs(selCliente.limite_credito - selCliente.saldo_deudor)} tono="ok" />

              <div className="mt-3">
                <Campo rotulo="Monto a cobrar (Gs.)">
                  <input
                    className="ui-campo num text-right !h-[30px] !text-[15px] font-bold"
                    placeholder="0"
                    value={montoPago}
                    onChange={(e) => { const v = e.target.value.replace(/[^\d]/g, ''); setMontoPago(v ? Number(v).toLocaleString('es-PY') : ''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') pagarDeuda(); }}
                    autoFocus
                  />
                </Campo>
                <button type="button" onClick={pagarDeuda} className="ui-boton pri mt-2 w-full">
                  Registrar cobro
                </button>
              </div>
            </Caja>
          </aside>
        )}
      </div>
    </div>
  );
}
