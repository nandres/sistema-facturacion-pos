import { useEffect, useState } from 'react';
import type { LineaGanancia, ResumenEnvase } from '../../shared/types/ventas';
import { formatearGs, formatearGsConPrefijo } from '../utils/formatoGuarani';
import { Aviso, BarraHerramientas, Campo, Pestanas, TituloModulo, Vacio } from '../ui';

type Pestana = 'ganancias' | 'envases';

interface Props {
  idUsuario: number;
}

export default function Informes({ idUsuario }: Props): JSX.Element {
  const [pestana, setPestana] = useState<Pestana>('ganancias');
  const [desde, setDesde] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10));

  const [ganancias, setGanancias] = useState<LineaGanancia[]>([]);
  const [gananciaTotal, setGananciaTotal] = useState(0);
  const [envases, setEnvases] = useState<ResumenEnvase[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cargarGanancias() {
    setCargando(true);
    setError(null);
    try {
      const [rg, rt] = await Promise.all([
        window.api.informes.ganancias(desde || undefined, hasta || undefined, idUsuario),
        window.api.informes.gananciaTotal(desde || undefined, hasta || undefined, idUsuario),
      ]);
      if (rg.ok) setGanancias(rg.data);
      if (rt.ok) setGananciaTotal(rt.data);
    } catch { setError('Error al cargar ganancias.'); }
    finally { setCargando(false); }
  }

  async function cargarEnvases() {
    setCargando(true);
    setError(null);
    try {
      const r = await window.api.informes.envases(desde || undefined, hasta || undefined, idUsuario);
      if (r.ok) setEnvases(r.data);
    } catch { setError('Error al cargar envases.'); }
    finally { setCargando(false); }
  }

  useEffect(() => {
    if (pestana === 'ganancias') cargarGanancias();
    else cargarEnvases();
  }, [pestana, desde, hasta]);

  const gananciaConSigno = gananciaTotal >= 0
    ? formatearGsConPrefijo(gananciaTotal)
    : `-${formatearGsConPrefijo(Math.abs(gananciaTotal))}`;

  return (
    <div className="flex h-full min-h-0 flex-col bg-ui-fondo text-ui-tx">
      <TituloModulo
        derecha={
          <>
            <span>Ganancia del período</span>
            <span className={`num text-[15px] font-bold ${gananciaTotal >= 0 ? 'text-white' : 'text-red-200'}`}>
              {gananciaConSigno}
            </span>
          </>
        }
      >
        Informes
      </TituloModulo>

      <Pestanas
        activa={pestana}
        onCambiar={setPestana}
        opciones={[
          { valor: 'ganancias', etiqueta: 'Ganancias por línea' },
          { valor: 'envases', etiqueta: 'Envases' },
        ]}
      />

      <BarraHerramientas>
        <Campo rotulo="Desde" className="w-36">
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="ui-campo num" />
        </Campo>
        <Campo rotulo="Hasta" className="w-36">
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="ui-campo num" />
        </Campo>
      </BarraHerramientas>

      {error && <div className="shrink-0 px-2 pt-2"><Aviso tono="peligro">{error}</Aviso></div>}

      <div className="min-h-0 flex-1 overflow-auto bg-ui-sup">
        {cargando ? (
          <Vacio>Cargando…</Vacio>
        ) : pestana === 'ganancias' ? (
          ganancias.length === 0 ? (
            <Vacio>Sin datos en el período seleccionado.</Vacio>
          ) : (
            <table className="ui-grilla">
              <thead>
                <tr>
                  <th className="w-24 der">Venta n.º</th>
                  <th>Producto</th>
                  <th className="w-20 der">Cant.</th>
                  <th className="w-32 der">P. venta</th>
                  <th className="w-32 der">P. costo</th>
                  <th className="w-32 der">Ganancia unit.</th>
                  <th className="w-32 der">Ganancia línea</th>
                </tr>
              </thead>
              <tbody>
                {ganancias.map((g, i) => (
                  <tr key={i}>
                    <td className="num text-right text-ui-txs">{g.id_venta}</td>
                    <td>{g.nombre}</td>
                    <td className="num text-right">{g.cantidad}</td>
                    <td className="num text-right">{formatearGs(g.precio_venta)}</td>
                    <td className="num text-right">{formatearGs(g.precio_costo)}</td>
                    <td className={`num text-right ${g.ganancia >= 0 ? 'text-ui-ok' : 'text-ui-pel'}`}>
                      {formatearGs(g.ganancia)}
                    </td>
                    <td className={`num text-right font-bold ${g.ganancia >= 0 ? 'text-ui-ok' : 'text-ui-pel'}`}>
                      {formatearGs(g.ganancia * g.cantidad)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : envases.length === 0 ? (
          <Vacio>Sin envases registrados en el período.</Vacio>
        ) : (
          <table className="ui-grilla">
            <thead>
              <tr>
                <th>Envase</th>
                <th className="w-32 der">Cantidad</th>
                <th className="w-40 der">Monto total (Gs.)</th>
              </tr>
            </thead>
            <tbody>
              {envases.map((e) => (
                <tr key={e.id_envase}>
                  <td className="font-medium">{e.nombre}</td>
                  <td className="num text-right">{e.cantidad_total}</td>
                  <td className="num text-right font-bold">{formatearGs(e.monto_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
