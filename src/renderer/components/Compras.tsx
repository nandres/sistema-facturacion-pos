import { useState, useEffect, useRef, useCallback } from 'react';
import type { Proveedor, CompraDB } from '../../shared/types/ventas';
import { formatearGs } from '../utils/formatoGuarani';
import { Aviso, BarraHerramientas, Caja, Campo, Pestanas, TituloModulo, Vacio } from '../ui';

type Tab = 'proveedores' | 'nueva' | 'historial';

// Linea de la compra tal como se arma en pantalla, antes de mandarla al main.
// Lleva `nombre` para mostrarlo en la tabla; el payload de compras.registrar
// solo usa codigo_barras, cantidad y precio_costo.
interface LineaCompraUI {
  codigo_barras: string;
  nombre: string;
  cantidad: number;
  precio_costo: number;
}

interface Props {
  idUsuario: number;
}

export default function Compras({ idUsuario }: Props) {
  const [tab, setTab] = useState<Tab>('proveedores');
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [compras, setCompras] = useState<CompraDB[]>([]);
  const [showNuevoProv, setShowNuevoProv] = useState(false);
  const [provRuc, setProvRuc] = useState('');
  const [provRazon, setProvRazon] = useState('');
  const [provTel, setProvTel] = useState('');
  const [provContacto, setProvContacto] = useState('');

  const [provSel, setProvSel] = useState<number | ''>('');
  const [facturaNum, setFacturaNum] = useState('');
  const [lineas, setLineas] = useState<LineaCompraUI[]>([]);
  const [scanInput, setScanInput] = useState('');
  const [cantInput, setCantInput] = useState('1');
  const [costoInput, setCostoInput] = useState('');
  const scanRef = useRef<HTMLInputElement>(null);
  const [mensaje, setMensaje] = useState('');
  const [tipoMensaje, setTipoMensaje] = useState<'ok' | 'error'>('ok');

  const mostrarMensaje = useCallback((msg: string, tipo: 'ok' | 'error') => {
    setMensaje(msg);
    setTipoMensaje(tipo);
    setTimeout(() => setMensaje(''), 3000);
  }, []);

  useEffect(() => {
    cargarProveedores();
  }, []);

  async function cargarProveedores() {
    const r = await window.api.proveedores.listar();
    if (r.ok) setProveedores(r.data);
    else mostrarMensaje(r.mensaje, 'error');
  }

  async function crearProveedor() {
    if (!provRazon.trim()) { mostrarMensaje('Razón social requerida', 'error'); return; }
    const r = await window.api.proveedores.crear({
      ruc: provRuc.trim() || undefined,
      razon_social: provRazon.trim(),
      telefono: provTel.trim() || undefined,
      contacto: provContacto.trim() || undefined,
    });
    if (r.ok) {
      mostrarMensaje('Proveedor creado', 'ok');
      setShowNuevoProv(false);
      setProvRuc(''); setProvRazon(''); setProvTel(''); setProvContacto('');
      cargarProveedores();
    } else mostrarMensaje(r.mensaje, 'error');
  }

  async function agregarLinea() {
    const codigo = scanInput.trim();
    const cantidad = parseFloat(cantInput);
    const costo = parseInt(costoInput.replace(/\./g, ''), 10);
    if (!codigo || !cantidad || !costo) { mostrarMensaje('Completá código, cantidad y costo', 'error'); return; }

    const r = await window.api.productos.obtener(codigo);
    if (!r.ok) { mostrarMensaje(r.mensaje, 'error'); return; }
    if (!r.data) { mostrarMensaje('Producto no encontrado', 'error'); return; }
    const producto = r.data;

    setLineas((prev) => [...prev, {
      codigo_barras: codigo,
      nombre: producto.nombre,
      cantidad,
      precio_costo: costo,
    }]);
    setScanInput('');
    setCantInput('1');
    setCostoInput('');
    scanRef.current?.focus();
  }

  function eliminarLinea(idx: number) {
    setLineas((prev) => prev.filter((_, i) => i !== idx));
  }

  const totalCompra = lineas.reduce((s, l) => s + Math.round(l.cantidad * l.precio_costo), 0);

  async function guardarCompra() {
    if (lineas.length === 0) { mostrarMensaje('Agregá al menos un producto', 'error'); return; }
    const r = await window.api.compras.registrar({
      id_proveedor: provSel || undefined,
      factura_numero: facturaNum.trim() || undefined,
      lineas: lineas.map((l) => ({ codigo_barras: l.codigo_barras, cantidad: l.cantidad, precio_costo: l.precio_costo })),
    }, idUsuario);
    if (r.ok) {
      mostrarMensaje('Compra registrada', 'ok');
      setLineas([]);
      setFacturaNum('');
      setProvSel('');
    } else mostrarMensaje(r.mensaje, 'error');
  }

  async function cargarHistorial() {
    const r = await window.api.compras.listar(undefined, undefined, idUsuario);
    if (r.ok) setCompras(r.data);
    else mostrarMensaje(r.mensaje, 'error');
  }

  useEffect(() => {
    if (tab === 'historial') cargarHistorial();
  }, [tab]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-ui-fondo text-ui-tx">
      <TituloModulo
        derecha={
          tab === 'nueva' ? (
            <>
              <span>Total de la compra</span>
              <span className="num text-[15px] font-bold">{formatearGs(totalCompra)}</span>
            </>
          ) : undefined
        }
      >
        Compras y proveedores
      </TituloModulo>

      <Pestanas
        activa={tab}
        onCambiar={setTab}
        opciones={[
          { valor: 'proveedores' as Tab, etiqueta: 'Proveedores', contador: proveedores.length },
          { valor: 'nueva' as Tab, etiqueta: 'Cargar compra' },
          { valor: 'historial' as Tab, etiqueta: 'Historial', contador: compras.length },
        ]}
      />

      {mensaje && (
        <div className="shrink-0 px-2 pt-2">
          <Aviso tono={tipoMensaje === 'ok' ? 'ok' : 'peligro'}>{mensaje}</Aviso>
        </div>
      )}

      {/* ── Proveedores ── */}
      {tab === 'proveedores' && (
        <>
          <BarraHerramientas
            acciones={
              <button type="button" onClick={() => setShowNuevoProv(!showNuevoProv)} className="ui-boton sel">
                {showNuevoProv ? 'Cerrar alta' : 'Nuevo proveedor'}
              </button>
            }
          >
            <span className="text-[11px] text-ui-txs">A quién le compra el comercio.</span>
          </BarraHerramientas>

          {showNuevoProv && (
            <div className="shrink-0 p-2">
              <Caja titulo="Alta de proveedor" cuerpoClassName="p-2">
                <div
                  className="grid grid-cols-4 gap-2"
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') { e.preventDefault(); setShowNuevoProv(false); }
                    if (e.key === 'Enter' && provRazon.trim()) { e.preventDefault(); crearProveedor(); }
                  }}
                >
                  <Campo rotulo="RUC">
                    <input className="ui-campo num" placeholder="12345678-9" value={provRuc} onChange={(e) => setProvRuc(e.target.value)} />
                  </Campo>
                  <Campo rotulo="Razón social *">
                    <input className="ui-campo uppercase" value={provRazon} onChange={(e) => setProvRazon(e.target.value)} />
                  </Campo>
                  <Campo rotulo="Teléfono">
                    <input className="ui-campo num" placeholder="+595" value={provTel} onChange={(e) => setProvTel(e.target.value)} />
                  </Campo>
                  <Campo rotulo="Contacto">
                    <input className="ui-campo" placeholder="Nombre del cobrador" value={provContacto} onChange={(e) => setProvContacto(e.target.value)} />
                  </Campo>
                </div>
                <div className="mt-2 flex justify-end gap-1.5">
                  <button type="button" onClick={() => setShowNuevoProv(false)} className="ui-boton">Cancelar</button>
                  <button type="button" onClick={crearProveedor} className="ui-boton pri">Guardar proveedor</button>
                </div>
              </Caja>
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-auto border-t border-ui-bdf bg-ui-sup">
            {proveedores.length === 0 ? (
              <Vacio>No hay proveedores dados de alta.</Vacio>
            ) : (
              <table className="ui-grilla">
                <thead>
                  <tr>
                    <th className="w-40">RUC</th>
                    <th>Razón social</th>
                    <th className="w-40">Teléfono</th>
                    <th className="w-56">Contacto</th>
                  </tr>
                </thead>
                <tbody>
                  {proveedores.map((p) => (
                    <tr key={p.id_proveedor}>
                      <td className="num text-ui-txs">{p.ruc || '—'}</td>
                      <td className="font-medium">{p.razon_social}</td>
                      <td className="num text-ui-txs">{p.telefono || '—'}</td>
                      <td className="text-ui-txs">{p.contacto || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* ── Carga de compra ── */}
      {tab === 'nueva' && (
        <>
          <BarraHerramientas
            acciones={
              <button type="button" onClick={guardarCompra} disabled={lineas.length === 0} className="ui-boton pri">
                Guardar compra
              </button>
            }
          >
            <Campo rotulo="Proveedor" className="w-64">
              <select
                className="ui-campo"
                value={provSel}
                onChange={(e) => setProvSel(e.target.value ? Number(e.target.value) : '')}
              >
                <option value="">Sin proveedor</option>
                {proveedores.map((p) => <option key={p.id_proveedor} value={p.id_proveedor}>{p.razon_social}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Factura n.º" className="w-48">
              <input className="ui-campo num" placeholder="001-001-0000001" value={facturaNum} onChange={(e) => setFacturaNum(e.target.value)} />
            </Campo>
          </BarraHerramientas>

          <div className="shrink-0 p-2">
            <Caja titulo="Agregar producto a la compra" cuerpoClassName="p-2">
              <div className="flex items-end gap-2">
                <Campo rotulo="Código de barras" className="flex-1">
                  <input
                    ref={scanRef}
                    className="ui-campo num"
                    placeholder="Escaneá el producto"
                    value={scanInput}
                    onChange={(e) => setScanInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregarLinea(); } }}
                  />
                </Campo>
                <Campo rotulo="Cantidad" className="w-28">
                  <input
                    className="ui-campo num text-right"
                    placeholder="1"
                    value={cantInput}
                    onChange={(e) => setCantInput(e.target.value.replace(/\D/g, ''))}
                  />
                </Campo>
                <Campo rotulo="Costo unitario (Gs.)" className="w-40">
                  <input
                    className="ui-campo num text-right"
                    placeholder="0"
                    value={costoInput}
                    onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setCostoInput(v ? Number(v).toLocaleString('es-PY') : ''); }}
                  />
                </Campo>
                <button type="button" onClick={agregarLinea} className="ui-boton">Agregar línea</button>
              </div>
            </Caja>
          </div>

          <div className="min-h-0 flex-1 overflow-auto border-t border-ui-bdf bg-ui-sup">
            {lineas.length === 0 ? (
              <Vacio>Todavía no cargaste productos en esta compra.</Vacio>
            ) : (
              <table className="ui-grilla">
                <thead>
                  <tr>
                    <th className="w-11 cen">Ítem</th>
                    <th className="w-40">Código</th>
                    <th>Producto</th>
                    <th className="w-24 der">Cant.</th>
                    <th className="w-32 der">Costo unit.</th>
                    <th className="w-36 der">Subtotal</th>
                    <th className="w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l, i) => (
                    <tr key={i}>
                      <td className="num text-center text-ui-txt">{String(i + 1).padStart(2, '0')}</td>
                      <td className="num text-ui-txs">{l.codigo_barras}</td>
                      <td>{l.nombre}</td>
                      <td className="num text-right">{l.cantidad}</td>
                      <td className="num text-right">{formatearGs(l.precio_costo)}</td>
                      <td className="num text-right font-bold">{formatearGs(Math.round(l.cantidad * l.precio_costo))}</td>
                      <td className="!p-0 text-center">
                        <button
                          type="button"
                          onClick={() => eliminarLinea(i)}
                          title="Quitar la línea"
                          className="ui-boton !min-h-[18px] !px-2 !text-[11px]"
                        >
                          Quitar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-4 border-t-2 border-ui-bdf bg-ui-barra px-3 py-1.5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-ui-txt">Total de la compra</span>
            <span className="num text-[24px] font-bold leading-none">{formatearGs(totalCompra)}</span>
          </div>
        </>
      )}

      {/* ── Historial ── */}
      {tab === 'historial' && (
        <div className="min-h-0 flex-1 overflow-auto border-t border-ui-bdf bg-ui-sup">
          {compras.length === 0 ? (
            <Vacio>No hay compras registradas.</Vacio>
          ) : (
            <table className="ui-grilla">
              <thead>
                <tr>
                  <th className="w-24 der">N.º</th>
                  <th className="w-52">Fecha y hora</th>
                  <th>Proveedor</th>
                  <th className="w-44">Factura</th>
                  <th className="w-36 der">Total (Gs.)</th>
                </tr>
              </thead>
              <tbody>
                {compras.map((c) => {
                  const prov = proveedores.find((p) => p.id_proveedor === c.id_proveedor);
                  return (
                    <tr key={c.id_compra}>
                      <td className="num text-right text-ui-txs">{c.id_compra}</td>
                      <td className="num">{new Date(c.fecha_hora).toLocaleString('es-PY')}</td>
                      <td>{prov?.razon_social || '—'}</td>
                      <td className="num text-ui-txs">{c.factura_numero || '—'}</td>
                      <td className="num text-right font-bold">{formatearGs(c.total)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
