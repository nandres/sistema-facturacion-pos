import { useState, useEffect, useRef } from 'react';
import Login from './components/Login';
import VentaPOS from './components/VentaPOS';
import HistorialVentas from './components/HistorialVentas';
import AlertaStock from './components/AlertaStock';
import CajaControl from './components/CajaControl';
import Cuentas from './components/Cuentas';
import Informes from './components/Informes';
import Compras from './components/Compras';
import Dashboard from './components/Dashboard';
import Fiado from './components/Fiado';
import Home from './components/Home';
import TitleBar from './components/TitleBar';
import Configuracion from './components/Configuracion';
import VentasFallidas from './components/VentasFallidas';
import BarraAtajos, { type Atajo } from './components/BarraAtajos';
import BarraMenu, { type Menu } from './components/BarraMenu';
import { Semaforo } from './ui';
import { useAtajos, PRIORIDAD_APP } from './hooks/useAtajos';
import { useTema } from './contexts/ThemeContext';
import type { UsuarioSesion } from '../shared/types/ventas';
import { puedeVer, type Pantalla } from '../shared/roles';

/**
 * Minutos sin una sola tecla ni un solo clic antes de volver al login.
 *
 * Una caja en uso nunca llega: cada escaneo del lector es una tecla, así que
 * el reloj se reinicia con cada producto. Lo que corta son las cajas que
 * quedan solas --el turno terminó, el cajero se fue a almorzar-- y que hasta
 * ahora seguían abiertas con su identidad. Importa más de lo que parece: el
 * arqueo cuelga del `id_usuario`, así que una caja abierta a nombre de otro
 * no es solo un problema de seguridad, es plata mal atribuida.
 *
 * El carrito no se pierde: se guarda en cada cambio y se recupera al volver
 * a entrar.
 */
const MINUTOS_INACTIVIDAD = 15;

// Mapa de teclas visible en caja. El orden es el del flujo de trabajo: las
// acciones de la venta en curso primero, que son las que el cajero usa todo el
// dia; la navegacion entre pantallas al final, sobre Ctrl.
//
// F1-F4 son de la caja, no de la navegacion. Los atajos de pantalla tienen
// prioridad sobre los de aplicacion, asi que si la navegacion siguiera en F1-F4
// quedaria tapada mientras se cobra; moverla a Ctrl+F# deja las dos cosas
// operables sin mouse.
const ATAJOS_CAJA: Atajo[] = [
  { tecla: 'F1', accion: 'Cliente' },
  { tecla: 'F2', accion: 'Buscar' },
  { tecla: 'F3', accion: 'Cantidad' },
  { tecla: 'F4', accion: 'Anular línea' },
  { tecla: 'F7', accion: 'Retener venta' },
  { tecla: 'F12', accion: 'COBRAR', destacado: true },
  { tecla: 'ESC', accion: 'Cancelar' },
  { tecla: 'Ctrl+F1', accion: 'Caja', tenue: true },
  { tecla: 'Ctrl+F2', accion: 'Historial', tenue: true },
  { tecla: 'Ctrl+F3', accion: 'Stock', tenue: true },
  { tecla: 'Ctrl+F4', accion: 'Menú', tenue: true },
];

// Fuera de la caja sólo queda la navegación: cada módulo pone lo suyo en su
// propia barra de herramientas, no en el pie.
const ATAJOS_GENERAL: Atajo[] = [
  { tecla: 'Ctrl+F1', accion: 'Caja' },
  { tecla: 'Ctrl+F2', accion: 'Historial' },
  { tecla: 'Ctrl+F3', accion: 'Stock' },
  { tecla: 'Ctrl+F4', accion: 'Menú principal' },
];

export default function App(): JSX.Element {
  const { tema, toggle: toggleTema } = useTema();
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(null);
  const [pantalla, setPantalla] = useState<Pantalla>('caja');
  const [stockCritico, setStockCritico] = useState(0);
  const [conectado, setConectado] = useState(true);
  const [pendientes, setPendientes] = useState(0);
  const [fallidas, setFallidas] = useState(0);
  const [verFallidas, setVerFallidas] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval>>();
  const [updateInfo, setUpdateInfo] = useState<{ version: string; url: string; changelog?: string } | null>(null);
  const [descargando, setDescargando] = useState(false);

  async function checkEstado() {
    try {
      const r = await window.api.offline.estado();
      if (r.ok) {
        setConectado(r.data.conectado);
        setPendientes(r.data.pendientes);
        setFallidas(r.data.fallidas);
      }
    } catch { /* ignore */ }
  }

  async function checkStock() {
    try {
      const r = await window.api.stock.critico();
      if (r.ok) setStockCritico(r.data.length);
    } catch { /* ignore */ }
  }

  async function sincronizarPendientes() {
    if (pendientes === 0) return;
    const conectado = await window.api.offline.verificarConexion();
    if (!conectado.ok || !conectado.data) return;
    await window.api.offline.sincronizar();
    await checkEstado();
  }

  useEffect(() => {
    checkEstado();
    checkStock();
    checkUpdates();
    timerRef.current = setInterval(() => {
      checkEstado();
      checkStock();
    }, 30000);

    return () => { clearInterval(timerRef.current); };
  }, []);

  // Navegacion global, sobre Ctrl. Va con prioridad de aplicacion: si la
  // pantalla activa usa la misma combinacion, la consume primero.
  //
  // Antes estaba en F1-F4 pelados, que es donde la caja necesita sus propias
  // acciones. Como los atajos de pantalla ganan, la navegacion quedaba tapada
  // justo en la pantalla donde mas se la necesita.
  useAtajos(
    {
      'Ctrl+F1': () => setPantalla('caja'),
      'Ctrl+F2': () => setPantalla('historial'),
      'Ctrl+F3': () => setPantalla('stock'),
      'Ctrl+F4': () => setPantalla('home'),
    },
    PRIORIDAD_APP,
  );

  async function checkUpdates() {
    try {
      const r = await window.api.actualizar.check();
      if (r.ok && r.data && r.data.disponible) {
        setUpdateInfo({ version: r.data.version, url: r.data.url, changelog: r.data.changelog });
      }
    } catch { /* ignore */ }
  }

  async function descargarActualizacion() {
    if (!updateInfo) return;
    setDescargando(true);
    try {
      await window.api.actualizar.descargarEInstalar();
    } finally {
      setDescargando(false);
    }
  }

  useEffect(() => {
    sincronizarPendientes();
  }, [pendientes]);

  // Bloqueo por inactividad. Escucha en captura y en toda la ventana, para que
  // el reloj se reinicie aunque el foco esté dentro del input de escaneo --que
  // es donde vive el 90% del tiempo.
  useEffect(() => {
    if (!usuario) return;
    let ultimo = Date.now();
    const marcar = (): void => { ultimo = Date.now(); };
    const eventos = ['keydown', 'mousedown', 'wheel', 'touchstart'] as const;
    eventos.forEach((e) => window.addEventListener(e, marcar, { capture: true, passive: true }));

    const reloj = setInterval(() => {
      if (Date.now() - ultimo < MINUTOS_INACTIVIDAD * 60_000) return;
      void window.api.usuarios.cerrarSesion();
      setUsuario(null);
      setPantalla('caja');
    }, 30_000);

    return () => {
      eventos.forEach((e) => window.removeEventListener(e, marcar, { capture: true }));
      clearInterval(reloj);
    };
  }, [usuario]);

  if (!usuario) {
    return <Login onLogin={(u) => { setUsuario(u); setPantalla('home'); }} />;
  }

  // El rol decide qué se dibuja; la base decide qué se permite. Si las dos no
  // dijeran lo mismo, el cajero vería botones que terminan en un error de
  // permisos. Ver src/shared/roles.ts.
  const visible = (p: Pantalla): boolean => puedeVer(usuario.rol, p);

  // Red de seguridad: si la pantalla activa dejó de estar permitida --cambio
  // de usuario sin recargar-- se vuelve a la caja en vez de renderizar algo
  // que este rol no debería estar viendo.
  const pantallaEfectiva: Pantalla = visible(pantalla) ? pantalla : 'caja';

  // Los menús se arman con todos los ítems y después se filtran por rol. Un
  // grupo que se queda sin ítems no se dibuja: para un cajero, «Informes» no
  // aparece como un menú vacío, no aparece.
  const menus: Menu[] = ([
    {
      titulo: 'Ventas',
      items: [
        { etiqueta: 'Caja', atajo: 'Ctrl+F1', pantalla: 'caja' as const, onClick: () => setPantalla('caja') },
        { etiqueta: 'Historial de ventas', atajo: 'Ctrl+F2', pantalla: 'historial' as const, onClick: () => setPantalla('historial') },
      ],
    },
    {
      titulo: 'Stock',
      items: [
        { etiqueta: 'Control de stock', atajo: 'Ctrl+F3', pantalla: 'stock' as const, onClick: () => setPantalla('stock') },
        { etiqueta: 'Compras y proveedores', pantalla: 'compras' as const, onClick: () => setPantalla('compras') },
      ],
    },
    {
      titulo: 'Caja',
      items: [
        { etiqueta: 'Apertura y arqueo', pantalla: 'cajacontrol' as const, onClick: () => setPantalla('cajacontrol') },
        { etiqueta: 'Cuentas a pagar y cobrar', pantalla: 'cuentas' as const, onClick: () => setPantalla('cuentas') },
        { etiqueta: 'Clientes en cuenta corriente', pantalla: 'fiado' as const, onClick: () => setPantalla('fiado') },
      ],
    },
    {
      titulo: 'Informes',
      items: [
        { etiqueta: 'Panel del día', pantalla: 'dashboard' as const, onClick: () => setPantalla('dashboard') },
        { etiqueta: 'Informes de ganancias', pantalla: 'informes' as const, onClick: () => setPantalla('informes') },
      ],
    },
    {
      titulo: 'Sistema',
      items: [
        { etiqueta: 'Configuración', pantalla: 'config' as const, onClick: () => setPantalla('config') },
        { etiqueta: 'Menú principal', atajo: 'Ctrl+F4', pantalla: 'home' as const, onClick: () => setPantalla('home') },
        { etiqueta: 'Modo oscuro', marcado: tema === 'claro', separadorAntes: true, onClick: toggleTema },
        { etiqueta: 'Cambiar de usuario', separadorAntes: true, onClick: () => { void window.api.usuarios.cerrarSesion(); setUsuario(null); } },
        { etiqueta: 'Salir del sistema', onClick: () => window.api.ventana.cerrar() },
      ],
    },
  ] as { titulo: string; items: (Menu['items'][number] & { pantalla?: Pantalla })[] }[])
    .map((m) => ({ ...m, items: m.items.filter((i) => !i.pantalla || visible(i.pantalla)) }))
    .filter((m) => m.items.length > 0);

  const atajos = pantallaEfectiva === 'caja' ? ATAJOS_CAJA : ATAJOS_GENERAL;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-ui-fondo text-ui-tx">
      <TitleBar />

      <BarraMenu
        menus={menus}
        derecha={
          <>
            {pendientes > 0 && (
              <span className="num border border-ui-ale bg-ui-ales px-1.5 text-[10.5px] font-bold text-ui-ale">
                {pendientes} sin sincronizar
              </span>
            )}
            {/* Plata ya cobrada que la base rechazó. Va en rojo y por delante
                del stock: es lo único del sistema que representa dinero que no
                está registrado en ningún lado. */}
            {fallidas > 0 && (
              <button
                type="button"
                onClick={() => setVerFallidas(true)}
                title="Ventas cobradas que no se pudieron registrar. Hay que cargarlas a mano."
                className="num border border-ui-pel bg-ui-pels px-1.5 text-[10.5px] font-bold text-ui-pel hover:brightness-95"
              >
                {fallidas} sin registrar
              </button>
            )}
            {stockCritico > 0 && (
              <button
                type="button"
                onClick={() => setPantalla('stock')}
                title="Productos por debajo del stock mínimo"
                className="num border border-ui-pel bg-ui-pels px-1.5 text-[10.5px] font-bold text-ui-pel hover:brightness-95"
              >
                {stockCritico} bajo mínimo
              </button>
            )}
            <span className="text-[11px] text-ui-txs">
              {usuario.nombre_empleado}
              <span className="ml-1.5 uppercase tracking-wide text-ui-txt">{usuario.rol}</span>
            </span>
          </>
        }
      />

      {updateInfo && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-ui-bdf bg-ui-infs px-2 py-1 text-[12px] text-ui-inf">
          <span>
            Hay una versión nueva disponible: <strong className="num">{updateInfo.version}</strong>
            {updateInfo.changelog && <span className="ml-2 opacity-80">{updateInfo.changelog}</span>}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={descargarActualizacion} disabled={descargando} className="ui-boton sel">
              {descargando ? 'Descargando…' : 'Actualizar ahora'}
            </button>
            <button type="button" onClick={() => setUpdateInfo(null)} className="ui-boton">Después</button>
          </div>
        </div>
      )}

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {pantallaEfectiva === 'home' && <Home onNavigate={setPantalla} idUsuario={usuario.id_usuario} stockCritico={stockCritico} rol={usuario.rol} />}
        {pantallaEfectiva === 'caja' && (
          <VentaPOS
            idUsuario={usuario.id_usuario}
            nombreCajero={usuario.nombre_empleado}
            conectado={conectado}
            pendientes={pendientes}
          />
        )}
        {pantallaEfectiva === 'historial' && <HistorialVentas idUsuario={usuario.id_usuario} rol={usuario.rol} />}
        {pantallaEfectiva === 'cajacontrol' && <CajaControl idUsuario={usuario.id_usuario} nombreCajero={usuario.nombre_empleado} />}
        {pantallaEfectiva === 'cuentas' && <Cuentas />}
        {pantallaEfectiva === 'informes' && <Informes idUsuario={usuario.id_usuario} />}
        {pantallaEfectiva === 'stock' && <AlertaStock />}
        {pantallaEfectiva === 'dashboard' && <Dashboard idUsuario={usuario.id_usuario} />}
        {pantallaEfectiva === 'compras' && <Compras idUsuario={usuario.id_usuario} />}
        {pantallaEfectiva === 'fiado' && <Fiado />}
        {pantallaEfectiva === 'config' && <Configuracion />}
      </main>

      {verFallidas && (
        <VentasFallidas onCerrar={() => setVerFallidas(false)} onCambio={checkEstado} />
      )}

      <BarraAtajos
        atajos={atajos}
        estado={
          <>
            <Semaforo
              estado={conectado ? 'ok' : 'mal'}
              texto={conectado ? 'En línea' : 'Sin conexión'}
              detalle={conectado ? 'Conectado a Supabase' : 'Las ventas se guardan localmente hasta que vuelva la conexión'}
            />
            <span className="text-[11px] text-ui-txt">v1.0.0</span>
          </>
        }
      />
    </div>
  );
}
