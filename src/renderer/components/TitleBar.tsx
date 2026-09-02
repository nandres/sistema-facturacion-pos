import type { CSSProperties } from 'react';
import { useComercio } from '../contexts/ComercioContext';

// WebkitAppRegion es propiedad de Electron, no del tipo CSSProperties estandar.
const areaArrastre = { WebkitAppRegion: 'drag' } as CSSProperties;
const areaSinArrastre = { WebkitAppRegion: 'no-drag' } as CSSProperties;

/**
 * Barra de titulo de la ventana.
 *
 * Angosta a proposito --24px-- porque no aporta nada al trabajo del cajero y
 * cada pixel que ocupa se lo saca a la grilla de items. Lleva el nombre del
 * comercio, que es lo unico que hace falta para saber en que instalacion se
 * esta, y los tres controles de ventana con las glifos de Windows.
 */
export default function TitleBar(): JSX.Element {
  const { comercio } = useComercio();
  return (
    <div
      className="flex h-6 shrink-0 select-none items-center justify-between border-b border-ui-bdf bg-ui-sel pl-2 text-ui-inv"
      style={areaArrastre}
    >
      <span className="truncate text-[11px] font-semibold tracking-wide">
        {comercio.nombre}
        <span className="ml-2 font-normal text-white/55">Facturación y Stock</span>
      </span>

      <div className="flex h-full items-stretch" style={areaSinArrastre}>
        <BotonVentana onClick={() => window.api.ventana.minimizar()} etiqueta="Minimizar">
          &#xE921;
        </BotonVentana>
        <BotonVentana onClick={() => window.api.ventana.maximizar()} etiqueta="Maximizar">
          &#xE922;
        </BotonVentana>
        <BotonVentana onClick={() => window.api.ventana.cerrar()} etiqueta="Cerrar" peligro>
          &#xE8BB;
        </BotonVentana>
      </div>
    </div>
  );
}

/**
 * Los glifos salen de Segoe MDL2 Assets, la fuente de iconos que ya trae
 * Windows. Sin SVG propios: son exactamente los mismos trazos que dibuja
 * cualquier otra ventana del sistema, y eso es justamente lo que se busca.
 */
function BotonVentana({ children, onClick, etiqueta, peligro }: {
  children: string;
  onClick: () => void;
  etiqueta: string;
  peligro?: boolean;
}): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      title={etiqueta}
      aria-label={etiqueta}
      style={{ fontFamily: '"Segoe MDL2 Assets", "Segoe UI Symbol", sans-serif' }}
      className={`flex w-11 items-center justify-center text-[10px] leading-none text-white/80 hover:text-white ${
        peligro ? 'hover:bg-[#c42b1c]' : 'hover:bg-white/15'
      }`}
    >
      {children}
    </button>
  );
}
