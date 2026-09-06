import { useState, useRef, useEffect } from 'react';
import { Aviso, Caja, Campo } from '../ui';
import { claveValida, urlValida } from '../../shared/config/conexion';

interface Props {
  onListo: () => void;
}

/**
 * Lo primero que ve una instalación nueva.
 *
 * Antes esto no existía porque la conexión venía adentro del instalador: había
 * un `.exe` por comercio, compilado con su `.env`. Ahora el instalador es uno
 * solo y la caja pregunta a qué base tiene que hablarle.
 *
 * Quien completa esto es el dueño del comercio o quien le instala el sistema,
 * una vez, el día que se instala. No es una pantalla de uso diario, así que
 * dice de dónde se sacan los datos en vez de dar por sabido que se sabe.
 */
export default function ConfiguracionInicial({ onListo }: Props): JSX.Element {
  const [url, setUrl] = useState('');
  const [serviceKey, setServiceKey] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [verClaves, setVerClaves] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);

  useEffect(() => { urlRef.current?.focus(); }, []);

  // Se valida en vivo para que el botón diga si falta algo antes de apretarlo:
  // el error del otro lado llega después de un viaje por IPC.
  const urlOk = urlValida(url);
  const serviceOk = claveValida(serviceKey);
  const anonOk = !anonKey.trim() || claveValida(anonKey);
  const completo = urlOk && serviceOk && anonOk;

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (!completo || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      const r = await window.api.config.guardarConexion({
        url: url.trim(),
        serviceRoleKey: serviceKey.trim(),
        anonKey: anonKey.trim(),
      });
      if (!r.ok) { setError(r.mensaje); return; }
      onListo();
    } catch {
      setError('No se pudo guardar la configuración.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex h-full w-full flex-col bg-ui-fondo text-ui-tx">
      <div className="flex shrink-0 items-baseline gap-3 bg-ui-sel px-3 py-2 text-ui-inv">
        <span className="text-[13px] font-bold uppercase tracking-[0.18em]">Primera configuración</span>
        <span className="text-[11px] text-white/65">Facturación y Stock</span>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-auto p-6">
        <form onSubmit={handleSubmit} className="w-[460px]">
          <Caja titulo="Conexión con la base de datos" cuerpoClassName="p-4">
            <div className="space-y-3">
              <Aviso tono="info">
                Esta caja todavía no sabe con qué base tiene que trabajar. Los tres
                datos están en el panel de Supabase del comercio, en
                <strong> Project Settings → API</strong>. Se cargan una sola vez.
              </Aviso>

              <Campo rotulo="Dirección del proyecto">
                <input
                  ref={urlRef}
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://xxxxxxxx.supabase.co"
                  autoComplete="off"
                  spellCheck={false}
                  className="ui-campo !h-[30px] text-[13px]"
                />
              </Campo>

              <Campo rotulo="Clave de servicio (service_role)">
                <input
                  type={verClaves ? 'text' : 'password'}
                  value={serviceKey}
                  onChange={(e) => setServiceKey(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  className="ui-campo !h-[30px] text-[13px]"
                />
              </Campo>

              <Campo rotulo="Clave pública (anon) — opcional">
                <input
                  type={verClaves ? 'text' : 'password'}
                  value={anonKey}
                  onChange={(e) => setAnonKey(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  className="ui-campo !h-[30px] text-[13px]"
                />
              </Campo>

              <button
                type="button"
                onClick={() => setVerClaves(!verClaves)}
                className="px-1 text-[10px] font-bold uppercase tracking-wider text-ui-txt hover:text-ui-tx"
              >
                {verClaves ? 'Ocultar claves' : 'Ver claves'}
              </button>

              {/* El error de forma se avisa antes de mandar: pegar la dirección
                  en el campo de la clave es el error real de esta pantalla. */}
              {url && !urlOk && <Aviso tono="alerta">La dirección tiene que empezar con https://</Aviso>}
              {serviceKey && !serviceOk && <Aviso tono="alerta">Esa no parece una clave de Supabase.</Aviso>}
              {anonKey && !anonOk && <Aviso tono="alerta">La clave pública no tiene el formato esperado.</Aviso>}
              {error && <Aviso tono="peligro">{error}</Aviso>}

              <button
                type="submit"
                disabled={!completo || guardando}
                className="ui-boton pri w-full !min-h-[32px] !text-[14px]"
              >
                {guardando ? 'Guardando…' : 'Guardar y continuar'}
              </button>

              <p className="text-[11px] leading-snug text-ui-txt">
                La clave de servicio queda guardada en esta computadora, cifrada con
                el sistema de Windows. Se puede cambiar después desde Configuración.
              </p>
            </div>
          </Caja>
        </form>
      </div>

      <div className="ui-barra-pie flex h-[26px] shrink-0 items-center justify-between px-2 text-[11px] text-ui-txs">
        <span>Sistema de Facturación y Stock</span>
        <span className="num">v1.0.0</span>
      </div>
    </div>
  );
}
