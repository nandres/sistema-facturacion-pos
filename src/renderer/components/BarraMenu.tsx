import { useEffect, useRef, useState } from 'react';

export interface ItemMenu {
  etiqueta: string;
  atajo?: string;
  onClick: () => void;
  separadorAntes?: boolean;
  marcado?: boolean;
}

export interface Menu {
  titulo: string;
  items: ItemMenu[];
}

interface Props {
  menus: Menu[];
  /** Se dibuja pegado a la derecha: usuario, hora, lo que la app quiera. */
  derecha?: React.ReactNode;
}

/**
 * Barra de menu de aplicacion de escritorio.
 *
 * Un supermercado tiene once modulos y un cajero que entra por dos. Una grilla
 * de tarjetas en una pantalla de inicio obliga a volver al inicio cada vez;
 * una barra de menu deja todo a un click desde donde sea que este parado, que
 * es como funciona cualquier sistema de gestion.
 *
 * Se comporta como la de Windows: el primer click abre, despues basta con
 * pasar el mouse por los demas titulos, ESC cierra y un click afuera tambien.
 */
export default function BarraMenu({ menus, derecha }: Props): JSX.Element {
  const [abierto, setAbierto] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // Click afuera y ESC cierran. Van sobre document para atrapar tambien los
  // clicks sobre el contenido de la pantalla, que esta fuera de este arbol.
  useEffect(() => {
    if (!abierto) return;
    const alClickear = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setAbierto(null);
    };
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); setAbierto(null); }
    };
    document.addEventListener('mousedown', alClickear);
    document.addEventListener('keydown', alTeclear, true);
    return () => {
      document.removeEventListener('mousedown', alClickear);
      document.removeEventListener('keydown', alTeclear, true);
    };
  }, [abierto]);

  return (
    <div ref={ref} className="ui-barra relative z-40 flex h-[26px] shrink-0 items-stretch">
      {menus.map((m) => (
        <div key={m.titulo} className="relative flex">
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); setAbierto(abierto === m.titulo ? null : m.titulo); }}
            onMouseEnter={() => { if (abierto) setAbierto(m.titulo); }}
            className={`px-3 text-[12px] font-medium ${
              abierto === m.titulo ? 'bg-ui-sel text-ui-inv' : 'text-ui-tx hover:bg-ui-alta'
            }`}
          >
            {m.titulo}
          </button>

          {abierto === m.titulo && (
            <div className="absolute left-0 top-full min-w-[228px] border border-ui-bdf bg-ui-sup py-1 shadow-[0_8px_22px_rgba(0,0,0,0.30)]">
              {m.items.map((it) => (
                <div key={it.etiqueta}>
                  {it.separadorAntes && <div className="my-1 border-t border-ui-bd" />}
                  <button
                    type="button"
                    onClick={() => { setAbierto(null); it.onClick(); }}
                    className="flex w-full items-center gap-4 px-3 py-[3px] text-left text-[12.5px] text-ui-tx hover:bg-ui-sel hover:text-ui-inv"
                  >
                    <span className="w-3 shrink-0 text-[11px] leading-none">{it.marcado ? '✓' : ''}</span>
                    <span className="flex-1 whitespace-nowrap">{it.etiqueta}</span>
                    {it.atajo && <span className="num shrink-0 text-[10.5px] opacity-60">{it.atajo}</span>}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      {derecha && <div className="ml-auto flex items-center gap-3 pr-2">{derecha}</div>}
    </div>
  );
}
