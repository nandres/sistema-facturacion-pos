import { useState, useEffect, useCallback } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import type { TopProducto, VentaPorHora } from '../../shared/types/ventas';
import { formatearGsConPrefijo as gs } from '../utils/formatoGuarani';
import { BarraHerramientas, Caja, Campo, TituloModulo, Vacio } from '../ui';

// Serie de los graficos, en la paleta del sistema: azules de la familia del
// acento, y despues ambar y rojo, que son los otros dos roles del tema. Sin
// verde ni violeta, que no corresponden a ningun rol.
const COLORS = ['#1f4e79', '#3d84c4', '#7fb2e0', '#97600a', '#a52834'];

// Recharts entrega los valores del tooltip como string | number | array segun
// la serie. Normalizamos a entero antes de mostrarlo.
function formatearEntero(valor: unknown): string {
  const n = Number(Array.isArray(valor) ? valor[0] : valor);
  return Number.isFinite(n) ? n.toFixed(0) : '0';
}

// El callback de `label` del Pie recibe las props internas de Recharts, que no
// declaran las claves de nuestro dataset. El cast acota la lectura a lo nuestro.
function etiquetaPorcion(props: unknown): string {
  const { nombre, percent } = props as { nombre?: string; percent?: number };
  return `${nombre ?? ''} (${((percent ?? 0) * 100).toFixed(0)}%)`;
}

interface Props {
  idUsuario: number;
}

export default function Dashboard({ idUsuario }: Props) {
  const [desde, setDesde] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  });
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10));
  const [top, setTop] = useState<TopProducto[]>([]);
  const [horas, setHoras] = useState<VentaPorHora[]>([]);
  const [gananciaNeta, setGananciaNeta] = useState(0);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    const desdeISO = desde + 'T00:00:00';
    const hastaISO = hasta + 'T23:59:59';
    const [rTop, rHoras, rGan] = await Promise.all([
      window.api.informes.topProductos(desdeISO, hastaISO, idUsuario),
      window.api.informes.ventasPorHora(desdeISO, hastaISO, idUsuario),
      window.api.informes.gananciaTotalNeta(desdeISO, hastaISO, idUsuario),
    ]);
    if (rTop.ok) setTop(rTop.data);
    if (rHoras.ok) setHoras(rHoras.data);
    if (rGan.ok) setGananciaNeta(rGan.data);
    setCargando(false);
  }, [desde, hasta]);

  useEffect(() => { cargar(); }, [cargar]);

  // Los gráficos leen los colores del tema, no constantes: así el panel sigue
  // siendo legible cuando la caja está en modo oscuro.
  const tinta = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const estiloTooltip = {
    backgroundColor: tinta('--ui-sup'),
    border: `1px solid ${tinta('--ui-bd-fuerte')}`,
    borderRadius: 0,
    color: tinta('--ui-tx'),
    fontSize: 12,
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-ui-fondo text-ui-tx">
      <TituloModulo
        derecha={
          <>
            <span>Ganancia neta</span>
            <span className="num text-[15px] font-bold">{gs(gananciaNeta)}</span>
          </>
        }
      >
        Panel del día
      </TituloModulo>

      <BarraHerramientas acciones={cargando ? <span className="text-[11px] text-ui-txs">Cargando…</span> : undefined}>
        <Campo rotulo="Desde" className="w-36">
          <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className="ui-campo num" />
        </Campo>
        <Campo rotulo="Hasta" className="w-36">
          <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className="ui-campo num" />
        </Campo>
      </BarraHerramientas>

      <div className="min-h-0 flex-1 overflow-auto p-3">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Caja titulo="Los cinco más vendidos" cuerpoClassName="p-2">
            {top.length === 0 ? (
              <Vacio>Sin datos en el período</Vacio>
            ) : (
              <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                  <Pie data={top} dataKey="cantidad_total" nameKey="nombre" cx="50%" cy="50%" outerRadius={82} label={etiquetaPorcion}>
                    {top.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke={tinta('--ui-sup')} />)}
                  </Pie>
                  <Tooltip contentStyle={estiloTooltip} formatter={(value) => [formatearEntero(value), 'Cantidad']} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </Caja>

          <Caja titulo="Ventas por hora" cuerpoClassName="p-2">
            {horas.every((h) => h.cantidad === 0) ? (
              <Vacio>Sin ventas en el período</Vacio>
            ) : (
              <ResponsiveContainer width="100%" height={230}>
                <BarChart data={horas}>
                  <CartesianGrid strokeDasharray="2 2" stroke={tinta('--ui-bd')} vertical={false} />
                  <XAxis dataKey="hora" tick={{ fill: tinta('--ui-tx-ten'), fontSize: 11 }} tickFormatter={(h) => `${h}`} axisLine={{ stroke: tinta('--ui-bd-fuerte') }} tickLine={false} />
                  <YAxis tick={{ fill: tinta('--ui-tx-ten'), fontSize: 11 }} axisLine={{ stroke: tinta('--ui-bd-fuerte') }} tickLine={false} width={34} />
                  <Tooltip contentStyle={estiloTooltip} cursor={{ fill: tinta('--ui-sel-suave') }} formatter={(value) => [formatearEntero(value), 'Ventas']} labelFormatter={(h) => `${h}:00 h`} />
                  <Bar dataKey="cantidad" fill={tinta('--ui-sel')} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Caja>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4">
          <Caja titulo="Ganancia neta del período" cuerpoClassName="px-3 py-2">
            <div className="num text-[26px] font-bold leading-none">{gs(gananciaNeta)}</div>
            <p className="mt-1 text-[11px] text-ui-txt">Ventas menos el costo de los productos.</p>
          </Caja>
        </div>
      </div>
    </div>
  );
}
