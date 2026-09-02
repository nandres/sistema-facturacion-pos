import { useEffect, useState } from 'react';
import type { ProductoAlertaStock } from '../../shared/types/ventas';
import { formatearGs } from '../utils/formatoGuarani';
import { Aviso, BarraHerramientas, Caja, Campo, Modal, TituloModulo, Vacio } from '../ui';
import type { ProductoFaltante } from '../../shared/types/productos';

const STOCK_LIMITE = 5;

export default function AlertaStock(): JSX.Element {
  const [productos, setProductos] = useState<ProductoAlertaStock[]>([]);
  const [cargando, setCargando] = useState(true);
  const [generando, setGenerando] = useState<string | null>(null);
  const [imprimiendo, setImprimiendo] = useState<string | null>(null);
  const [importando, setImportando] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [listaComprasProd, setListaComprasProd] = useState<ProductoFaltante[] | null>(null);
  const [generandoLista, setGenerandoLista] = useState(false);
  const [showCatModal, setShowCatModal] = useState(false);
  const [categorias, setCategorias] = useState<{ id_categoria: number; nombre: string; color: string }[]>([]);
  const [catCargando, setCatCargando] = useState(false);
  const [nuevaCatNombre, setNuevaCatNombre] = useState('');
  const [nuevaCatColor, setNuevaCatColor] = useState('#6366f1');
  const [catGuardando, setCatGuardando] = useState(false);

  async function cargar() {
    setCargando(true);
    try {
      const r = await window.api.stock.critico();
      if (r.ok) setProductos(r.data);
    } catch (err) {
      console.error('[AlertaStock]', err);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargar(); }, []);

  async function importarExcel() {
    setImportando(true);
    setImportResult(null);
    try {
      const r = await window.api.productosImportarExcel();
      if (r.ok) {
        if (r.data.insertados > 0) {
          setImportResult(`Importados ${r.data.insertados} de ${r.data.total} productos.`);
          cargar();
        } else {
          setImportResult('Ningún producto importado.');
        }
      } else {
        setImportResult('Error: ' + r.mensaje);
      }
    } catch (err) {
      setImportResult('Error al importar: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setImportando(false);
    }
  }

  async function generarListaCompras() {
    setGenerandoLista(true);
    try {
      const r = await window.api.stock.listaCompras(STOCK_LIMITE);
      if (r.ok) setListaComprasProd(r.data.productos);
    } finally {
      setGenerandoLista(false);
    }
  }

  async function imprimirLista() {
    if (!listaComprasProd || listaComprasProd.length === 0) return;
    const r = await window.api.stock.imprimirLista(listaComprasProd);
    if (!r.ok) alert(r.mensaje);
  }

  async function generarCodigo(p: ProductoAlertaStock) {
    setGenerando(p.codigo_barras);
    try {
      const r1 = await window.api.productos.generarCodigo();
      if (!r1.ok) { alert(r1.mensaje); return; }
      const nuevoCodigo = r1.data;
      const r2 = await window.api.productos.actualizarCodigo(p.codigo_barras, nuevoCodigo);
      if (!r2.ok) { alert(r2.mensaje); return; }
      setProductos((prev) => prev.map((x) => x.codigo_barras === p.codigo_barras ? { ...x, codigo_barras: nuevoCodigo } : x));
    } finally {
      setGenerando(null);
    }
  }

  async function imprimirEtiqueta(p: ProductoAlertaStock) {
    setImprimiendo(p.codigo_barras);
    try {
      const r = await window.api.productos.imprimirEtiqueta({
        codigo: p.codigo_barras,
        nombre: p.nombre,
        precio: p.precio_venta,
      });
      if (!r.ok) alert(r.mensaje);
    } finally {
      setImprimiendo(null);
    }
  }

  async function cargarCategorias() {
    setCatCargando(true);
    try {
      const r = await window.api.categorias.listar();
      if (r.ok) setCategorias(r.data);
    } finally { setCatCargando(false); }
  }

  async function crearCategoria() {
    if (!nuevaCatNombre.trim()) return;
    setCatGuardando(true);
    try {
      const r = await window.api.categorias.crear(nuevaCatNombre.trim(), nuevaCatColor);
      if (r.ok) { setNuevaCatNombre(''); setNuevaCatColor('#6366f1'); cargarCategorias(); }
      else alert(r.mensaje);
    } finally { setCatGuardando(false); }
  }

  async function eliminarCategoria(id: number) {
    if (!window.confirm('¿Eliminar esta categoría? Los productos quedarán sin categoría.')) return;
    try {
      const r = await window.api.categorias.eliminar(id);
      if (r.ok) cargarCategorias();
      else alert(r.mensaje);
    } catch { /* ignore */ }
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-ui-fondo text-ui-tx">
      <TituloModulo derecha={<span className="num">{productos.length} por reponer</span>}>
        Control de stock
      </TituloModulo>

      <BarraHerramientas
        acciones={
          <>
            <button type="button" onClick={() => { cargarCategorias(); setShowCatModal(true); }} className="ui-boton">
              Rubros
            </button>
            <button type="button" onClick={importarExcel} disabled={importando} className="ui-boton">
              {importando ? 'Importando…' : 'Importar Excel'}
            </button>
            <button type="button" onClick={generarListaCompras} disabled={generandoLista} className="ui-boton sel">
              {generandoLista ? 'Generando…' : 'Lista de compras'}
            </button>
            <button type="button" onClick={cargar} className="ui-boton">Actualizar</button>
          </>
        }
      >
        <span className="text-[11px] text-ui-txs">
          Productos con menos de <b className="num">{STOCK_LIMITE}</b> unidades.
        </span>
      </BarraHerramientas>

      {importResult && (
        <div className="shrink-0 px-2 pt-2">
          <Aviso tono={importResult.startsWith('Error') ? 'peligro' : 'ok'}>
            <span className="flex items-center justify-between gap-3">
              {importResult}
              <button type="button" onClick={() => setImportResult(null)} className="px-1 opacity-70 hover:opacity-100">✕</button>
            </span>
          </Aviso>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto border-t border-ui-bdf bg-ui-sup">
        {cargando ? (
          <Vacio>Cargando…</Vacio>
        ) : productos.length === 0 ? (
          <Vacio>Todos los productos tienen stock suficiente.</Vacio>
        ) : (
          <table className="ui-grilla">
            <thead>
              <tr>
                <th className="w-40">Código</th>
                <th>Producto</th>
                <th className="w-24 der">Stock</th>
                <th className="w-32 der">Precio (Gs.)</th>
                <th className="w-56 cen">Etiqueta</th>
              </tr>
            </thead>
            <tbody>
              {productos.map((p) => (
                <tr key={p.codigo_barras}>
                  <td className="num text-ui-txs">{p.codigo_barras}</td>
                  <td>{p.nombre}</td>
                  <td className="num text-right font-bold">
                    <span className={p.stock <= 0 ? 'text-ui-pel' : 'text-ui-ale'}>{p.stock}</span>
                  </td>
                  <td className="num text-right">{formatearGs(p.precio_venta)}</td>
                  <td className="!p-0">
                    <div className="flex items-center justify-center gap-1 py-px">
                      <button
                        type="button"
                        onClick={() => generarCodigo(p)}
                        disabled={generando === p.codigo_barras}
                        title="Generar un código de barras EAN-13 para este producto"
                        className="ui-boton !min-h-[18px] !px-2 !text-[11px]"
                      >
                        {generando === p.codigo_barras ? '…' : 'Generar código'}
                      </button>
                      <button
                        type="button"
                        onClick={() => imprimirEtiqueta(p)}
                        disabled={imprimiendo === p.codigo_barras}
                        title="Imprimir la etiqueta con el código de barras"
                        className="ui-boton !min-h-[18px] !px-2 !text-[11px]"
                      >
                        {imprimiendo === p.codigo_barras ? '…' : 'Imprimir'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {listaComprasProd && (
        <Modal
          titulo="Lista de compras"
          ancho="w-[720px]"
          onCerrar={() => setListaComprasProd(null)}
          pie={
            <>
              <button type="button" onClick={() => setListaComprasProd(null)} className="ui-boton">Cerrar</button>
              <button type="button" onClick={imprimirLista} disabled={listaComprasProd.length === 0} className="ui-boton pri">
                Imprimir lista
              </button>
            </>
          }
        >
          {listaComprasProd.length === 0 ? (
            <Vacio>No hay productos con stock bajo.</Vacio>
          ) : (
            <table className="ui-grilla">
              <thead>
                <tr>
                  <th className="w-40">Código</th>
                  <th>Producto</th>
                  <th className="w-24 der">Stock</th>
                  <th className="w-24 der">Pedir</th>
                </tr>
              </thead>
              <tbody>
                {listaComprasProd.map((p) => (
                  <tr key={p.codigo_barras}>
                    <td className="num text-ui-txs">{p.codigo_barras}</td>
                    <td>{p.nombre}</td>
                    <td className="num text-right text-ui-pel">{p.stock}</td>
                    <td className="num text-right font-bold">{p.cantidad_necesaria}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}

      {showCatModal && (
        <Modal
          titulo="Rubros de producto"
          ancho="w-[440px]"
          onCerrar={() => setShowCatModal(false)}
          pie={<button type="button" onClick={() => setShowCatModal(false)} className="ui-boton">Cerrar</button>}
        >
          <div className="p-3">
            <div className="mb-3 flex items-end gap-1.5">
              <Campo rotulo="Nombre del rubro" className="flex-1">
                <input
                  type="text"
                  value={nuevaCatNombre}
                  onChange={(e) => setNuevaCatNombre(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && nuevaCatNombre.trim()) crearCategoria(); }}
                  className="ui-campo"
                />
              </Campo>
              <Campo rotulo="Color" className="w-14">
                <input
                  type="color"
                  value={nuevaCatColor}
                  onChange={(e) => setNuevaCatColor(e.target.value)}
                  className="ui-campo !p-0.5"
                />
              </Campo>
              <button
                type="button"
                onClick={crearCategoria}
                disabled={catGuardando || !nuevaCatNombre.trim()}
                className="ui-boton sel"
              >
                {catGuardando ? '…' : 'Agregar'}
              </button>
            </div>

            <Caja titulo="Rubros dados de alta" cuerpoClassName="p-0">
              {catCargando ? (
                <Vacio>Cargando…</Vacio>
              ) : categorias.length === 0 ? (
                <Vacio>Sin rubros cargados.</Vacio>
              ) : (
                <table className="ui-grilla">
                  <tbody>
                    {categorias.map((c) => (
                      <tr key={c.id_categoria}>
                        <td className="w-7 text-center">
                          <span className="inline-block h-3 w-3 border border-ui-bdf align-middle" style={{ backgroundColor: c.color }} />
                        </td>
                        <td>{c.nombre}</td>
                        <td className="w-16 !p-0 text-center">
                          <button
                            type="button"
                            onClick={() => eliminarCategoria(c.id_categoria)}
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
            </Caja>
          </div>
        </Modal>
      )}
    </div>
  );
}
