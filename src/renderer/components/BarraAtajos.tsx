import { useEffect, useState, type ReactNode } from 'react';

export interface Atajo {
  tecla: string;
  accion: string;
  /** Resalta el atajo principal de la pantalla (el de cobrar, tipicamente). */
  destacado?: boolean;
  /** Baja el peso visual: navegacion y otras teclas de segunda linea. */
  tenue?: boolean;
}

interface Props {
  atajos: Atajo[];
  /** Bloques de estado del sistema, alineados a la derecha. */
  estado?: ReactNode;
}

/**
 * Barra de estado al pie de la ventana.
 *
 * Cumple las dos funciones que cumple en cualquier sistema de gestion: a la
 * izquierda el mapa de teclas de la pantalla activa --el cajero trabaja de
 * memoria, pero tenerlo a la vista acorta el entrenamiento y evita que se use
 * el mouse para lo que tiene atajo-- y a la derecha el estado del puesto, que
 * tiene que poder mirarse sin cambiar de pantalla.
 */
export default function BarraAtajos({ atajos, estado }: Props): JSX.Element {
  const reloj = useReloj();

  return (
    <div className="ui-barra-pie flex h-[26px] shrink-0 items-center gap-3 overflow-hidden px-2">
      <div className="flex shrink-0 items-center gap-3">
        {atajos.filter((a) => !a.tenue).map((a) => <Item key={a.tecla} atajo={a} />)}
      </div>

      <div className="ml-auto flex shrink-0 items-center">
        {atajos.filter((a) => a.tenue).length > 0 && (
          <div className="flex items-center gap-2.5 border-l border-ui-bd px-3">
            {atajos.filter((a) => a.tenue).map((a) => <Item key={a.tecla} atajo={a} />)}
          </div>
        )}
        {estado && <div className="flex items-center gap-3 border-l border-ui-bd px-3">{estado}</div>}
        <span className="num border-l border-ui-bd pl-3 text-[11px] text-ui-txs">{reloj}</span>
      </div>
    </div>
  );
}

function Item({ atajo }: { atajo: Atajo }): JSX.Element {
  return (
    <span className="flex shrink-0 items-center gap-1.5">
      <kbd className={`ui-tecla ${atajo.destacado ? '!border-ui-ok !bg-ui-ok !text-white' : ''}`}>
        {atajo.tecla}
      </kbd>
      <span className={`text-[11px] leading-none ${
        atajo.destacado ? 'font-bold text-ui-tx' : atajo.tenue ? 'text-ui-txt' : 'text-ui-txs'
      }`}>
        {atajo.accion}
      </span>
    </span>
  );
}

/**
 * Fecha y hora al pie. En una caja se mira mas seguido de lo que parece: para
 * fechar un remito a mano, para saber si ya se paso el cierre del turno.
 */
function useReloj(): string {
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return ahora.toLocaleString('es-PY', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}
