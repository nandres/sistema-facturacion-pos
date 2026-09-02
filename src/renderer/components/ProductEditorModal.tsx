import { useEffect, useRef, useState } from 'react';
import type { Producto } from '../../shared/types/productos';
import { formatearGs } from '../utils/formatoGuarani';
import { BarraHerramientas, Caja, Campo, Fila, Modal, Vacio } from '../ui';

interface Props {
  onCerrar: () => void;
  codigoInicial?: string;
}

export default function ProductEditorModal({ onCerrar, codigoInicial }: Props): JSX.Element {
  const [termino, setTermino] = useState('');
  const [resultados, setResultados] = useState<Producto[]>([]);
  const [seleccionado, setSeleccionado] = useState<Producto | null>(null);
  const [cargando, setCargando] = useState(false);
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [nombre, setNombre] = useState('');
  const [precioVenta, setPrecioVenta] = useState(0);
  const [precioCosto, setPrecioCosto] = useState(0);
  const [stock, setStock] = useState(0);
  const [iva, setIva] = useState(10);
  const [codigoBarras, setCodigoBarras] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(false);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [indiceSeleccionado, setIndiceSeleccionado] = useState(-1);
  const [categorias, setCategorias] = useState<{ id_categoria: number; nombre: string; color: string }[]>([]);
  const [idCategoria, setIdCategoria] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const nombreRef = useRef<HTMLInputElement>(null);
  const guardandoRef = useRef(false);
  const guardarRef = useRef(guardar);
  guardarRef.current = guardar;
  const cancelarFormRef = useRef(cancelarForm);
  cancelarFormRef.current = cancelarForm;
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (codigoInicial) {
      setCodigoBarras(codigoInicial);
      setCreando(true);
      setEditando(true);
    }
    inputRef.current?.focus();
    window.api.categorias.listar().then((r) => { if (r.ok) setCategorias(r.data); });
  }, []);

  useEffect(() => {
    if (editando) nombreRef.current?.focus();
  }, [editando]);

  useEffect(() => {
    if (!editando) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        guardarRef.current();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelarFormRef.current();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editando]);

  // Escape cierra el modal desde la vista de búsqueda
  useEffect(() => {
    if (editando) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCerrar();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editando]);

  useEffect(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (termino.trim().length < 2) { setResultados([]); return; }
    timeoutRef.current = setTimeout(async () => {
      setCargando(true);
      try {
        const r = await window.api.productos.listar(termino.trim());
        if (r.ok) setResultados(r.data);
      } finally {
        setCargando(false);
      }
    }, 200);
    return () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); };
  }, [termino]);

  function editar(p: Producto) {
    setSeleccionado(p);
    setNombre(p.nombre);
    setPrecioVenta(p.precio_venta);
    setPrecioCosto(p.precio_costo);
    setStock(p.stock);
    setIva(p.iva ?? 10);
    setCodigoBarras(p.codigo_barras);
    setIdCategoria(p.id_categoria ?? null);
    setEditando(true);
    setCreando(false);
    setResultados([]);
    setTermino('');
  }

  function nuevo() {
    setSeleccionado(null);
    setNombre('');
    setPrecioVenta(0);
    setPrecioCosto(0);
    setStock(0);
    setIva(10);
    setCodigoBarras('');
    setIdCategoria(null);
    setCreando(true);
    setEditando(true);
  }

  async function generarCodigo() {
    const r = await window.api.productos.generarCodigo();
    if (r.ok) setCodigoBarras(r.data);
  }

  function cancelarForm() {
    setEditando(false);
    setCreando(false);
    setSeleccionado(null);
    setCodigoBarras('');
    setConfirmarEliminar(false);
  }

  async function eliminarProducto() {
    if (!seleccionado) return;
    if (!confirmarEliminar) { setConfirmarEliminar(true); return; }
    setEliminando(true);
    try {
      const r = await window.api.productos.eliminar(seleccionado.codigo_barras);
      if (!r.ok) { alert(r.mensaje); setConfirmarEliminar(false); return; }
      cancelarForm();
    } finally {
      setEliminando(false);
      setConfirmarEliminar(false);
    }
  }

  async function guardar() {
    if (!nombre.trim()) { alert('El nombre es obligatorio.'); return; }
    if (!codigoBarras.trim()) { alert('El código de barras es obligatorio.'); return; }
    if (guardandoRef.current) return;
    guardandoRef.current = true;
    setGuardando(true);
    try {
      if (creando) {
        const r = await window.api.productos.crear({
          codigo_barras: codigoBarras.trim(),
          nombre: nombre.trim(),
          precio_venta: precioVenta,
          precio_costo: precioCosto,
          stock,
          iva,
          id_categoria: idCategoria,
        });
        if (!r.ok) { alert(r.mensaje); return; }
      } else if (seleccionado) {
        const r = await window.api.productos.actualizar(seleccionado.codigo_barras, {
          nombre: nombre.trim(),
          precio_venta: precioVenta,
          precio_costo: precioCosto,
          stock,
          iva,
          id_categoria: idCategoria,
        });
        if (!r.ok) { alert(r.mensaje); return; }
      }
      cancelarForm();
    } finally {
      guardandoRef.current = false;
      setGuardando(false);
    }
  }

  return (
    <div onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); cancelarForm(); } }}>
      <Modal
        titulo={creando ? 'Nuevo producto' : editando ? 'Editar producto' : 'Buscar producto'}
        ancho="w-[620px]"
        onCerrar={onCerrar}
        pie={
          editando ? (
            <>
              <button type="button" onClick={cancelarForm} disabled={guardando} className="ui-boton">Cancelar</button>
              {!creando && (
                <button
                  type="button"
                  onClick={eliminarProducto}
                  disabled={guardando || eliminando}
                  className={`ui-boton ${confirmarEliminar ? 'pel' : ''}`}
                >
                  {eliminando ? 'Eliminando…' : confirmarEliminar ? '¿Confirmar?' : 'Eliminar'}
                </button>
              )}
              <button type="button" onClick={guardar} disabled={guardando} className="ui-boton pri">
                {guardando ? 'Guardando…' : creando ? 'Crear producto' : 'Guardar cambios'}
              </button>
            </>
          ) : (
            <button type="button" onClick={onCerrar} className="ui-boton">Cerrar</button>
          )
        }
      >
        {!editando ? (
          <div className="flex h-[420px] flex-col">
            <BarraHerramientas
              acciones={<button type="button" onClick={nuevo} className="ui-boton sel">Nuevo producto</button>}
            >
              <Campo rotulo="Buscar por nombre o código" className="w-80">
                <input
                  ref={inputRef}
                  type="text"
                  value={termino}
                  onChange={(e) => { setTermino(e.target.value); setIndiceSeleccionado(-1); }}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') { e.preventDefault(); setIndiceSeleccionado((p) => Math.min(p + 1, resultados.length - 1)); }
                    if (e.key === 'ArrowUp') { e.preventDefault(); setIndiceSeleccionado((p) => Math.max(p - 1, 0)); }
                    if (e.key === 'Enter') {
                      if (indiceSeleccionado >= 0 || resultados.length > 0) {
                        e.preventDefault();
                        e.stopPropagation();
                        editar(resultados[indiceSeleccionado >= 0 ? indiceSeleccionado : 0]);
                      }
                    }
                    if (e.key === 'Escape') { setIndiceSeleccionado(-1); }
                  }}
                  placeholder="Al menos 2 caracteres"
                  className="ui-campo"
                />
              </Campo>
            </BarraHerramientas>

            <div className="min-h-0 flex-1 overflow-auto bg-ui-sup">
              {cargando ? (
                <Vacio>Buscando…</Vacio>
              ) : resultados.length === 0 ? (
                <Vacio>{termino ? 'Sin resultados.' : 'Escribí para buscar un producto.'}</Vacio>
              ) : (
                <table className="ui-grilla">
                  <thead>
                    <tr>
                      <th className="w-40">Código</th>
                      <th>Producto</th>
                      <th className="w-32 der">Precio (Gs.)</th>
                      <th className="w-20 der">Stock</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultados.map((p, i) => (
                      <tr
                        key={p.codigo_barras}
                        onClick={() => editar(p)}
                        className={i === indiceSeleccionado ? 'sel' : ''}
                      >
                        <td className="num text-ui-txs">{p.codigo_barras}</td>
                        <td className="font-medium">{p.nombre}</td>
                        <td className="num text-right font-bold">{formatearGs(p.precio_venta)}</td>
                        <td className={`num text-right ${p.stock <= 0 ? 'text-ui-pel' : ''}`}>{p.stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        ) : (
          <div
            className="space-y-2 p-3"
            onKeyDown={(e) => { if (e.key === 'Enter' && !guardando) { e.preventDefault(); guardar(); } }}
          >
            <Campo rotulo="Nombre del producto">
              <input
                ref={nombreRef}
                type="text"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className="ui-campo uppercase"
              />
            </Campo>

            <div className="grid grid-cols-2 gap-2">
              <Campo rotulo="Precio de venta (Gs.)">
                <input type="number" value={precioVenta} onChange={(e) => setPrecioVenta(Number(e.target.value))} className="ui-campo num text-right" />
              </Campo>
              <Campo rotulo="Precio de costo (Gs.)">
                <input type="number" value={precioCosto} onChange={(e) => setPrecioCosto(Number(e.target.value))} className="ui-campo num text-right" />
              </Campo>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Campo rotulo="Stock">
                <input type="number" value={stock} onChange={(e) => setStock(Number(e.target.value))} className="ui-campo num text-right" />
              </Campo>
              <Campo rotulo="IVA">
                <select value={iva} onChange={(e) => setIva(Number(e.target.value))} className="ui-campo">
                  <option value={0}>Exento</option>
                  <option value={5}>5%</option>
                  <option value={10}>10%</option>
                </select>
              </Campo>
              <Campo rotulo="Rubro">
                <select
                  value={idCategoria ?? ''}
                  onChange={(e) => setIdCategoria(e.target.value ? Number(e.target.value) : null)}
                  className="ui-campo"
                >
                  <option value="">Sin rubro</option>
                  {categorias.map((c) => <option key={c.id_categoria} value={c.id_categoria}>{c.nombre}</option>)}
                </select>
              </Campo>
            </div>

            <Campo rotulo={`Código de barras${creando ? ' (obligatorio)' : ''}`}>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={codigoBarras}
                  onChange={(e) => setCodigoBarras(e.target.value)}
                  placeholder={creando ? 'Escaneá el producto o generá un código' : ''}
                  className="ui-campo num flex-1"
                />
                {creando && (
                  <button type="button" onClick={generarCodigo} className="ui-boton shrink-0">
                    Generar EAN-13
                  </button>
                )}
              </div>
            </Campo>

            {precioVenta > 0 && precioCosto > 0 && (
              <Caja titulo="Margen" cuerpoClassName="p-2">
                <Fila
                  etiqueta="Ganancia por unidad"
                  valor={formatearGs(precioVenta - precioCosto)}
                  tono={precioVenta > precioCosto ? 'ok' : 'peligro'}
                  fuerte
                />
                <Fila
                  etiqueta="Sobre el costo"
                  valor={`${Math.round(((precioVenta - precioCosto) / precioCosto) * 100)} %`}
                  tono={precioVenta > precioCosto ? 'ok' : 'peligro'}
                />
              </Caja>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
