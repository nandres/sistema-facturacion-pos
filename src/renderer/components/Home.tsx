import { useEffect, useState } from 'react';
import { formatearGs } from '../utils/formatoGuarani';
import { playClick } from '../utils/soundService';
import { Caja, GrillaOps, TituloModulo, type Operacion } from '../ui';
import { puedeVer, type Pantalla } from '../../shared/roles';

interface Props {
  onNavigate: (p: Pantalla) => void;
  idUsuario: number;
  stockCritico: number;
  rol: string;
}

function getSaludo() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 18) return 'Buenas tardes';
  return 'Buenas noches';
}

const hoy = () => new Date().toISOString().slice(0, 10);

export default function Home({ onNavigate, idUsuario, stockCritico, rol }: Props): JSX.Element {
  const [cajaAbierta, setCajaAbierta] = useState<boolean | null>(null);
  const [ventasHoy, setVentasHoy] = useState(0);
  const [cargandoWidgets, setCargando] = useState(true);

  async function fetchWidgets() {
    try {
      const [rCaja, rVentas] = await Promise.all([
        window.api.caja.arqueoAbierto(idUsuario),
        window.api.ventas.listar(hoy(), hoy(), idUsuario),
      ]);
      setCajaAbierta(rCaja.ok && rCaja.data !== null);
      if (rVentas.ok) setVentasHoy(rVentas.data.reduce((s, v) => s + v.total_pagado, 0));
    } catch { /* ignore */ }
    finally { setCargando(false); }
  }

  useEffect(() => { fetchWidgets(); }, []);

  function handleNav(p: Pantalla) {
    playClick();
    onNavigate(p);
  }

  // Los módulos se filtran por rol, igual que la barra de menús: un grupo que
  // se queda sin operaciones no se dibuja vacío, no se dibuja. Ver
  // src/shared/roles.ts.
  const modulos: { grupo: string; ops: (Operacion & { pantalla: Pantalla })[] }[] = [
    {
      grupo: 'Ventas',
      ops: [
        { etiqueta: 'Caja', pantalla: 'caja', tecla: 'Ctrl+F1', onClick: () => handleNav('caja') },
        { etiqueta: 'Historial de ventas', pantalla: 'historial', tecla: 'Ctrl+F2', onClick: () => handleNav('historial') },
      ],
    },
    {
      grupo: 'Stock y compras',
      ops: [
        { etiqueta: 'Control de stock', pantalla: 'stock', tecla: 'Ctrl+F3', tono: stockCritico > 0 ? 'peligro' : undefined, onClick: () => handleNav('stock') },
        { etiqueta: 'Compras y proveedores', pantalla: 'compras', onClick: () => handleNav('compras') },
      ],
    },
    {
      grupo: 'Caja y cobranzas',
      ops: [
        { etiqueta: 'Apertura y arqueo', pantalla: 'cajacontrol', onClick: () => handleNav('cajacontrol') },
        { etiqueta: 'Cuentas a pagar y cobrar', pantalla: 'cuentas', onClick: () => handleNav('cuentas') },
        { etiqueta: 'Cuenta corriente de clientes', pantalla: 'fiado', onClick: () => handleNav('fiado') },
      ],
    },
    {
      grupo: 'Informes y sistema',
      ops: [
        { etiqueta: 'Panel del día', pantalla: 'dashboard', onClick: () => handleNav('dashboard') },
        { etiqueta: 'Informes de ganancias', pantalla: 'informes', onClick: () => handleNav('informes') },
        { etiqueta: 'Configuración', pantalla: 'config', onClick: () => handleNav('config') },
      ],
    },
  ];

  const visibles = modulos
    .map((m) => ({ ...m, ops: m.ops.filter((o) => puedeVer(rol, o.pantalla)) }))
    .filter((m) => m.ops.length > 0);

  return (
    <div className="flex h-full min-h-0 flex-col bg-ui-fondo text-ui-tx">
      <TituloModulo derecha={<span>{getSaludo()}</span>}>Menú principal</TituloModulo>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {/* Estado del turno: lo que hay que saber antes de empezar a trabajar. */}
        <div className="mb-4 grid grid-cols-3 gap-3">
          <Caja titulo="Turno de caja" cuerpoClassName="px-2 pb-2 pt-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className={`text-[17px] font-bold ${cargandoWidgets ? 'text-ui-txt' : cajaAbierta ? 'text-ui-ok' : 'text-ui-ale'}`}>
                {cargandoWidgets ? '…' : cajaAbierta ? 'ABIERTA' : 'CERRADA'}
              </span>
              <button type="button" onClick={() => handleNav('cajacontrol')} className="ui-boton !min-h-[22px] !text-[11px]">
                {cajaAbierta ? 'Arquear' : 'Abrir caja'}
              </button>
            </div>
            {!cargandoWidgets && !cajaAbierta && (
              <p className="mt-1 text-[11px] text-ui-txt">Abrí la caja antes de la primera venta del turno.</p>
            )}
          </Caja>

          <Caja titulo="Vendido hoy" cuerpoClassName="px-2 pb-2 pt-2.5">
            <div className="num text-[24px] font-bold leading-none">
              {cargandoWidgets ? '…' : formatearGs(ventasHoy)}
            </div>
            <p className="mt-1 text-[11px] text-ui-txt">Guaraníes, sólo tus ventas del día.</p>
          </Caja>

          <Caja titulo="Stock bajo mínimo" cuerpoClassName="px-2 pb-2 pt-2.5">
            <div className="flex items-baseline justify-between gap-2">
              <span className={`num text-[24px] font-bold leading-none ${stockCritico > 0 ? 'text-ui-pel' : 'text-ui-txt'}`}>
                {stockCritico}
              </span>
              {stockCritico > 0 && (
                <button type="button" onClick={() => handleNav('stock')} className="ui-boton !min-h-[22px] !text-[11px]">
                  Ver lista
                </button>
              )}
            </div>
            <p className="mt-1 text-[11px] text-ui-txt">
              {stockCritico > 0 ? 'Productos que hay que reponer.' : 'Nada por reponer.'}
            </p>
          </Caja>
        </div>

        {/* Los módulos, como grilla de operaciones. */}
        <div className="grid grid-cols-2 gap-4">
          {visibles.map((m) => (
            <Caja key={m.grupo} titulo={m.grupo} cuerpoClassName="p-2">
              <GrillaOps ops={m.ops} columnas={m.ops.length >= 3 ? 3 : 2} />
            </Caja>
          ))}
        </div>
      </div>
    </div>
  );
}
