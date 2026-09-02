/**
 * Primitivas del sistema de diseño.
 *
 * Los estilos viven en styles/index.css como clases `.ui-*`; acá está sólo lo
 * que necesita estructura de marcado o comportamiento. La regla es que ninguna
 * pantalla invente su propia caja, su propio botón ni su propia grilla: si algo
 * falta, se agrega acá y lo usan todas.
 */
import { useEffect, useRef, type ReactNode } from 'react';

/* ─────────────────────────────────────────────────────────────────────────
   Caja con título recostado en el borde. El agrupador de toda la vida.
   ───────────────────────────────────────────────────────────────────────── */
export function Caja({ titulo, children, className = '', cuerpoClassName = '' }: {
  titulo?: string;
  children: ReactNode;
  className?: string;
  cuerpoClassName?: string;
}): JSX.Element {
  return (
    <div className={`ui-caja ${className}`}>
      {titulo && <span className="ui-caja-tit">{titulo}</span>}
      <div className={cuerpoClassName || 'p-2'}>{children}</div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Encabezado de módulo: la franja azul que dice dónde está parado el usuario.
   ───────────────────────────────────────────────────────────────────────── */
export function TituloModulo({ children, derecha }: { children: ReactNode; derecha?: ReactNode }): JSX.Element {
  return (
    <div className="ui-titulo-modulo flex shrink-0 items-center justify-between gap-3">
      <span>{children}</span>
      {derecha && <span className="flex items-center gap-3 text-[11px] font-semibold normal-case tracking-normal">{derecha}</span>}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Barra de herramientas del módulo: va pegada bajo el título y lleva los
   filtros a la izquierda y las acciones a la derecha. Es la franja que en
   cualquier sistema de gestión reemplaza a los botones desperdigados.
   ───────────────────────────────────────────────────────────────────────── */
export function BarraHerramientas({ children, acciones }: {
  children?: ReactNode;
  acciones?: ReactNode;
}): JSX.Element {
  return (
    <div className="ui-barra flex shrink-0 flex-wrap items-end gap-2 px-2 py-1.5">
      {children}
      {acciones && <div className="ml-auto flex items-end gap-1.5">{acciones}</div>}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Solapas. La activa se une al contenido —sin borde abajo—, que es lo que
   hace leer la pestaña como carpeta y no como botón seleccionado.
   ───────────────────────────────────────────────────────────────────────── */
export function Pestanas<T extends string>({ opciones, activa, onCambiar }: {
  opciones: { valor: T; etiqueta: string; contador?: number }[];
  activa: T;
  onCambiar: (v: T) => void;
}): JSX.Element {
  return (
    <div className="flex shrink-0 items-end gap-px border-b border-ui-bdf bg-ui-barra px-2 pt-1.5">
      {opciones.map((o) => {
        const sel = o.valor === activa;
        return (
          <button
            key={o.valor}
            type="button"
            onClick={() => onCambiar(o.valor)}
            className={`-mb-px border px-3 py-1 text-[12px] font-semibold ${
              sel
                ? 'border-ui-bdf border-b-ui-sup bg-ui-sup text-ui-tx'
                : 'border-transparent border-b-ui-bdf text-ui-txs hover:bg-ui-alta'
            }`}
          >
            {o.etiqueta}
            {o.contador !== undefined && <span className="num ml-1.5 text-[11px] opacity-70">{o.contador}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Etiqueta de estado. Rectangular y con borde, no pastilla de color: dentro
   de una grilla densa una pastilla rellena pesa más que el dato que rotula.
   ───────────────────────────────────────────────────────────────────────── */
export function Etiqueta({ tono = 'neutro', children }: {
  tono?: 'ok' | 'peligro' | 'alerta' | 'info' | 'neutro';
  children: ReactNode;
}): JSX.Element {
  const est: Record<string, string> = {
    ok: 'border-ui-ok text-ui-ok bg-ui-oks',
    peligro: 'border-ui-pel text-ui-pel bg-ui-pels',
    alerta: 'border-ui-ale text-ui-ale bg-ui-ales',
    info: 'border-ui-inf text-ui-inf bg-ui-infs',
    neutro: 'border-ui-bdf text-ui-txs bg-ui-alta',
  };
  return (
    <span className={`inline-block border px-1.5 py-px text-[10px] font-bold uppercase leading-tight tracking-wider ${est[tono]}`}>
      {children}
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Tecla de función, dibujada como tecla.
   ───────────────────────────────────────────────────────────────────────── */
export function Tecla({ children }: { children: ReactNode }): JSX.Element {
  return <kbd className="ui-tecla">{children}</kbd>;
}

/* ─────────────────────────────────────────────────────────────────────────
   Rótulo + control. El rótulo va arriba y en versalita, no al costado: en una
   pantalla densa, alinear etiquetas a la izquierda desperdicia el ancho que
   necesitan los datos.
   ───────────────────────────────────────────────────────────────────────── */
export function Campo({ rotulo, children, className = '' }: {
  rotulo: string;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="ui-rotulo">{rotulo}</span>
      {children}
    </label>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Indicador de estado de un servicio. El color nunca va solo: al lado siempre
   hay texto, porque un cajero daltónico tiene que poder leerlo igual.
   ───────────────────────────────────────────────────────────────────────── */
export function Semaforo({ estado, texto, detalle }: {
  estado: 'ok' | 'mal' | 'espera';
  texto: string;
  detalle?: string;
}): JSX.Element {
  const color = estado === 'ok' ? 'bg-ui-ok' : estado === 'mal' ? 'bg-ui-pel' : 'bg-ui-txt';
  const tinta = estado === 'mal' ? 'text-ui-pel' : 'text-ui-txs';
  return (
    <span className="flex items-center gap-1.5" title={detalle ?? texto}>
      <span className={`h-2 w-2 rounded-full ${color}`} />
      <span className={`text-[10.5px] font-bold uppercase tracking-wider ${tinta}`}>{texto}</span>
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Modal. Barra de título azul arriba, botones abajo a la derecha.
   Se cierra con ESC y toma el foco al abrirse.
   ───────────────────────────────────────────────────────────────────────── */
export function Modal({ titulo, ancho = 'w-[440px]', onCerrar, pie, children }: {
  titulo: string;
  ancho?: string;
  onCerrar?: () => void;
  pie?: ReactNode;
  children: ReactNode;
}): JSX.Element {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  return (
    <div className="ui-velo">
      <div
        ref={ref}
        tabIndex={-1}
        onKeyDown={(e) => { if (e.key === 'Escape' && onCerrar) { e.stopPropagation(); onCerrar(); } }}
        className={`ui-modal ${ancho} outline-none`}
      >
        <header>
          <span>{titulo}</span>
          {onCerrar && (
            <button
              type="button"
              onClick={onCerrar}
              aria-label="Cerrar"
              className="px-1 text-[15px] leading-none text-white/75 hover:text-white"
            >
              ✕
            </button>
          )}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        {pie && <footer>{pie}</footer>}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Teclado numérico. Todo POS real trae uno: la caja puede quedar con el
   teclado roto, o con pantalla táctil y sin teclado.
   ───────────────────────────────────────────────────────────────────────── */
export function TecladoNumerico({ onTecla, onBorrar, onLimpiar, className = '' }: {
  onTecla: (d: string) => void;
  onBorrar: () => void;
  onLimpiar: () => void;
  className?: string;
}): JSX.Element {
  return (
    <div className={`ui-ops grid-cols-3 ${className}`}>
      {['7', '8', '9', '4', '5', '6', '1', '2', '3'].map((d) => (
        <button key={d} type="button" onClick={() => onTecla(d)} className="num !text-[15px]">{d}</button>
      ))}
      <button type="button" onClick={() => onTecla('0')} className="num !text-[15px]">0</button>
      <button type="button" onClick={() => onTecla('000')} className="num !text-[13px]">000</button>
      <button type="button" onClick={onBorrar} title="Borrar el último dígito">←</button>
      <button type="button" onClick={onLimpiar} className="col-span-3 !min-h-[26px] !text-[10px] uppercase tracking-wider">
        Limpiar
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Grilla de operaciones: los botones gordos para lo que no tiene código de
   barras. Cada uno puede mostrar su tecla de función abajo.
   ───────────────────────────────────────────────────────────────────────── */
export interface Operacion {
  etiqueta: string;
  tecla?: string;
  onClick: () => void;
  desactivado?: boolean;
  tono?: 'ok' | 'peligro' | 'alerta' | 'info';
  activo?: boolean;
}

export function GrillaOps({ ops, columnas = 3, className = '' }: {
  ops: Operacion[];
  columnas?: number;
  className?: string;
}): JSX.Element {
  const tinta: Record<string, string> = {
    ok: 'text-ui-ok',
    peligro: 'text-ui-pel',
    alerta: 'text-ui-ale',
    info: 'text-ui-inf',
  };
  return (
    <div className={`ui-ops ${className}`} style={{ gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}>
      {ops.map((o) => (
        <button
          key={o.etiqueta}
          type="button"
          onClick={o.onClick}
          disabled={o.desactivado}
          style={o.activo ? { background: 'var(--ui-sel)', color: 'var(--ui-tx-inv)' } : undefined}
          className={!o.activo && o.tono ? tinta[o.tono] : undefined}
        >
          <span>{o.etiqueta}</span>
          {o.tecla && <span className="num text-[9.5px] font-bold opacity-65">{o.tecla}</span>}
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Fila etiqueta/valor, para paneles de totales y fichas.
   ───────────────────────────────────────────────────────────────────────── */
export function Fila({ etiqueta, valor, tono, fuerte, grande }: {
  etiqueta: ReactNode;
  valor: ReactNode;
  tono?: 'ok' | 'peligro' | 'alerta' | 'info';
  fuerte?: boolean;
  grande?: boolean;
}): JSX.Element {
  const tinta = tono === 'ok' ? 'text-ui-ok'
    : tono === 'peligro' ? 'text-ui-pel'
      : tono === 'alerta' ? 'text-ui-ale'
        : tono === 'info' ? 'text-ui-inf'
          : 'text-ui-tx';
  return (
    <div className="flex items-baseline justify-between gap-3 leading-tight">
      <span className="shrink-0 text-[11px] text-ui-txs">{etiqueta}</span>
      <span className={`num ${grande ? 'text-[17px]' : 'text-[12.5px]'} ${fuerte ? 'font-bold' : ''} ${tinta}`}>
        {valor}
      </span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Aviso en línea. Reemplaza al toast flotante: en una pantalla de trabajo el
   mensaje va donde el ojo ya está, no en una esquina.
   ───────────────────────────────────────────────────────────────────────── */
export function Aviso({ tono, children }: { tono: 'ok' | 'peligro' | 'alerta' | 'info'; children: ReactNode }): JSX.Element {
  const est: Record<string, string> = {
    ok: 'bg-ui-oks text-ui-ok border-ui-ok',
    peligro: 'bg-ui-pels text-ui-pel border-ui-pel',
    alerta: 'bg-ui-ales text-ui-ale border-ui-ale',
    info: 'bg-ui-infs text-ui-inf border-ui-inf',
  };
  return (
    <div className={`border-l-[3px] px-2 py-1 text-[12px] font-medium leading-snug ${est[tono]}`}>
      {children}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Estado vacío de una grilla. Sobrio: una línea, sin ilustración.
   ───────────────────────────────────────────────────────────────────────── */
export function Vacio({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="flex h-full items-center justify-center p-6 text-[12px] italic text-ui-txt">
      {children}
    </div>
  );
}
