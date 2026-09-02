import { useEffect, useState } from 'react';
import { Aviso, BarraHerramientas, Caja, Campo, Etiqueta, Fila, TituloModulo, Vacio } from '../ui';
import { useComercio } from '../contexts/ComercioContext';

export default function Configuracion(): JSX.Element {
  const { comercio, refrescar: refrescarComercio } = useComercio();
  const [nombreComercio, setNombreComercio] = useState('');
  const [rucComercio, setRucComercio] = useState('');
  const [guardandoComercio, setGuardandoComercio] = useState(false);
  const [impresoras, setImpresoras] = useState<string[]>([]);
  const [actual, setActual] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState('');
  const [cargando, setCargando] = useState(true);
  const [manual, setManual] = useState('');
  const [probando, setProbando] = useState(false);

  useEffect(() => {
    window.api.config.listarImpresoras().then(r => {
      if (r.ok) {
        setImpresoras(r.data.impresoras);
        setActual(r.data.actual);
        if (r.data.actual && !r.data.impresoras.includes(r.data.actual)) {
          setManual(r.data.actual);
        }
      }
    }).finally(() => setCargando(false));
  }, []);

  // Los campos arrancan con lo que ya está guardado. Se sincronizan cuando el
  // contexto termina de cargar, que puede ser después del primer render.
  useEffect(() => {
    setNombreComercio(comercio.nombre);
    setRucComercio(comercio.ruc);
  }, [comercio.nombre, comercio.ruc]);

  async function guardarDatosComercio() {
    setGuardandoComercio(true);
    setMensaje('');
    try {
      const r = await window.api.config.guardarComercio({
        nombre: nombreComercio,
        ruc: rucComercio,
      });
      if (!r.ok) { setMensaje(`No se pudo guardar: ${r.mensaje}`); return; }
      // Refresca el contexto para que la barra de título, el login y la vista
      // previa del ticket muestren los datos nuevos sin reiniciar.
      await refrescarComercio();
      setMensaje('Datos del comercio guardados. Salen en el próximo ticket.');
    } catch {
      setMensaje('No se pudo guardar los datos del comercio.');
    } finally {
      setGuardandoComercio(false);
    }
  }

  async function seleccionar(nombre: string) {
    setGuardando(true);
    setMensaje('');
    const r = await window.api.config.guardarImpresora(nombre);
    if (r.ok) {
      setActual(nombre);
      setMensaje('Impresora guardada');
    } else {
      setMensaje('Error al guardar');
    }
    setGuardando(false);
    setTimeout(() => setMensaje(''), 3000);
  }

  async function probarImpresion() {
    setProbando(true);
    setMensaje('');
    const r = await window.api.config.testImpresora();
    if (r.ok) {
      setMensaje('Prueba enviada a la impresora');
    } else {
      setMensaje('Error al imprimir prueba');
    }
    setProbando(false);
    setTimeout(() => setMensaje(''), 5000);
  }

  return (
    <div className="flex h-full min-h-0 flex-col bg-ui-fondo text-ui-tx">
      <TituloModulo derecha={actual ? <span className="num">{actual}</span> : <span>Sin impresora</span>}>
        Configuración
      </TituloModulo>

      <BarraHerramientas
        acciones={
          <button type="button" onClick={probarImpresion} disabled={probando || !actual} className="ui-boton pri">
            {probando ? 'Imprimiendo…' : 'Probar impresión'}
          </button>
        }
      >
        <span className="text-[11px] text-ui-txs">Impresora de tickets de este puesto de caja.</span>
      </BarraHerramientas>

      {mensaje && <div className="shrink-0 px-2 pt-2"><Aviso tono="ok">{mensaje}</Aviso></div>}

      <div className="min-h-0 flex-1 overflow-auto p-3">
        {/* Va primero porque es la identidad del negocio: encabeza cada ticket
            que sale. Antes estaba escrito en el código fuente, lo que obligaba
            a recompilar el instalador para cada cliente. */}
        <div className="mb-4 max-w-4xl">
          <Caja titulo="Datos del comercio" cuerpoClassName="p-2">
            <div className="grid grid-cols-[1fr_240px] gap-2">
              <Campo rotulo="Nombre del comercio">
                <input
                  type="text"
                  value={nombreComercio}
                  onChange={(e) => setNombreComercio(e.target.value)}
                  placeholder="AUTOSERVICE J&M"
                  maxLength={32}
                  className="ui-campo uppercase"
                />
              </Campo>
              <Campo rotulo="RUC">
                <input
                  type="text"
                  value={rucComercio}
                  onChange={(e) => setRucComercio(e.target.value)}
                  placeholder="123456-0"
                  maxLength={20}
                  className="ui-campo num"
                />
              </Campo>
            </div>

            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                onClick={guardarDatosComercio}
                disabled={guardandoComercio || nombreComercio.trim() === ''}
                className="ui-boton pri"
              >
                {guardandoComercio ? 'Guardando…' : 'Guardar'}
              </button>
              <span className="text-[11px] text-ui-txt">
                Encabezan el ticket, la nota de crédito y el cierre Z. El nombre entra en
                32 columnas de papel: más largo que eso, se corta al imprimir.
              </span>
            </div>
          </Caja>
        </div>

        <div className="grid max-w-4xl grid-cols-2 gap-4">
          <Caja titulo="Impresoras detectadas" cuerpoClassName="p-0">
            {cargando ? (
              <Vacio>Buscando impresoras…</Vacio>
            ) : impresoras.length === 0 ? (
              <Vacio>Windows no reporta impresoras instaladas.</Vacio>
            ) : (
              <table className="ui-grilla">
                <tbody>
                  {impresoras.map((nombre) => (
                    <tr
                      key={nombre}
                      onClick={() => !guardando && seleccionar(nombre)}
                      className={actual === nombre ? 'sel' : ''}
                    >
                      <td className="w-7 text-center">{actual === nombre ? '✓' : ''}</td>
                      <td>{nombre}</td>
                      <td className="w-24 text-center">
                        {actual === nombre && <Etiqueta tono="ok">En uso</Etiqueta>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Caja>

          <div className="space-y-4">
            <Caja titulo="Escribir el nombre a mano" cuerpoClassName="p-2">
              <div className="flex items-end gap-1.5">
                <Campo rotulo="Nombre exacto de la impresora" className="flex-1">
                  <input
                    type="text"
                    value={manual}
                    onChange={(e) => setManual(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && manual.trim()) seleccionar(manual); }}
                    placeholder="Ej: 5830 Series"
                    className="ui-campo"
                  />
                </Campo>
                <button
                  type="button"
                  onClick={() => seleccionar(manual)}
                  disabled={guardando || !manual.trim()}
                  className="ui-boton sel"
                >
                  Guardar
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-ui-txt">
                Tiene que coincidir carácter por carácter con el nombre que aparece en
                «Dispositivos e impresoras» de Windows, mayúsculas incluidas.
              </p>
            </Caja>

            <Caja titulo="Puesto de caja" cuerpoClassName="p-2">
              <Fila etiqueta="Número de caja" valor={leerNroCajaConfig()} />
              <p className="mt-2 text-[11px] leading-relaxed text-ui-txt">
                Identifica esta terminal en la cabecera de la pantalla de cobro. Es por
                máquina, no por comercio.
              </p>
            </Caja>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Mismo dato que lee la caja: vive en el almacenamiento local de esta máquina. */
function leerNroCajaConfig(): string {
  try {
    return localStorage.getItem('nroCaja') || '01';
  } catch {
    return '01';
  }
}
