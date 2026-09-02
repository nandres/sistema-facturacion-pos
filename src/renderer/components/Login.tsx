import { useState, useRef, useEffect } from 'react';
import type { UsuarioSesion } from '../../shared/types/ventas';
import { useComercio } from '../contexts/ComercioContext';
import { Aviso, Caja, Campo } from '../ui';

interface Props {
  onLogin: (usuario: UsuarioSesion) => void;
}

export default function Login({ onLogin }: Props): JSX.Element {
  const { comercio, rucLinea } = useComercio();
  const [nombre, setNombre] = useState('');
  const [password, setPassword] = useState('');
  const [mostrarPass, setMostrarPass] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [fallidos, setFallidos] = useState(0);
  const [esperaHasta, setEsperaHasta] = useState(0);
  const [restante, setRestante] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  // Cuenta regresiva de la espera. Se muestra en el botón para que el cajero
  // sepa que el sistema no se colgó.
  useEffect(() => {
    if (esperaHasta === 0) return;
    const tick = (): void => {
      const seg = Math.ceil((esperaHasta - Date.now()) / 1000);
      setRestante(seg > 0 ? seg : 0);
      if (seg <= 0) setEsperaHasta(0);
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [esperaHasta]);

  function handleNombreChange(e: React.ChangeEvent<HTMLInputElement>) {
    setNombre(e.target.value.toUpperCase());
  }

  function handleNombreKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      passRef.current?.focus();
    }
  }

  /**
   * Espera progresiva después de varios intentos fallidos.
   *
   * El login nuevo pasa por Supabase Auth, que limita del lado del servidor,
   * pero el camino de respaldo --`verificar_usuario` contra la tabla-- no
   * limita nada: sin esto, se pueden probar contraseñas a la velocidad que
   * aguante la red. Los dos primeros errores no cuestan nada, que es lo que
   * pasa cuando alguien se equivoca de tecla; a partir del tercero empieza a
   * doler.
   */
  function esperaTrasFallo(intentos: number): number {
    if (intentos < 3) return 0;
    if (intentos < 5) return 5_000;
    if (intentos < 8) return 30_000;
    return 60_000;
  }

  function marcarFallo(mensaje: string): void {
    const n = fallidos + 1;
    setFallidos(n);
    setError(mensaje);
    const espera = esperaTrasFallo(n);
    if (espera > 0) setEsperaHasta(Date.now() + espera);
  }

  // El Enter en la contraseña no necesita handler propio: el input esta dentro
  // del <form>, asi que dispara handleSubmit por envio implicito.
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (restante > 0) return;
    if (!nombre.trim() || !password.trim()) { setError('Ingrese usuario y contraseña.'); return; }
    setCargando(true);
    setError(null);
    try {
      const r = await window.api.usuarios.autenticar(nombre.trim(), password);
      // Un fallo del sistema no es una contraseña equivocada: se muestra, pero
      // no cuenta como intento. Si no, un problema de base deja al cajero
      // esperando un minuto entre reintentos que no dependen de él.
      if (!r.ok) { setError(r.mensaje); return; }
      if (!r.data) { marcarFallo('Usuario o contraseña incorrectos.'); return; }
      setFallidos(0);
      onLogin(r.data);
    } catch {
      setError('Error de conexión. Verifique el servidor.');
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="flex h-full w-full flex-col bg-ui-fondo text-ui-tx">
      {/* Franja de identificación de la instalación, como la de cualquier
          terminal: qué sistema es y en qué comercio está instalado. */}
      <div className="flex shrink-0 items-baseline gap-3 bg-ui-sel px-3 py-2 text-ui-inv">
        <span className="text-[13px] font-bold uppercase tracking-[0.18em]">{comercio.nombre}</span>
        <span className="text-[11px] text-white/65">
          Facturación y Stock{rucLinea && ` · ${rucLinea}`}
        </span>
      </div>

      <div className="flex flex-1 items-center justify-center p-6">
        <form onSubmit={handleSubmit} className="w-[340px]">
          <Caja titulo="Ingreso al sistema" cuerpoClassName="p-4">
            <div className="space-y-3">
              <Campo rotulo="Usuario">
                <input
                  id="login-nombre"
                  ref={inputRef}
                  type="text"
                  value={nombre}
                  onChange={handleNombreChange}
                  onKeyDown={handleNombreKeyDown}
                  autoComplete="off"
                  spellCheck={false}
                  className="ui-campo !h-[30px] text-[15px] font-semibold uppercase"
                />
              </Campo>

              <Campo rotulo="Contraseña">
                <div className="relative">
                  <input
                    id="login-pass"
                    ref={passRef}
                    type={mostrarPass ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="ui-campo !h-[30px] pr-16 text-[15px]"
                  />
                  <button
                    type="button"
                    onClick={() => setMostrarPass(!mostrarPass)}
                    className="absolute right-1 top-1/2 -translate-y-1/2 px-1.5 py-px text-[10px] font-bold uppercase tracking-wider text-ui-txt hover:text-ui-tx"
                  >
                    {mostrarPass ? 'Ocultar' : 'Ver'}
                  </button>
                </div>
              </Campo>

              {error && <Aviso tono="peligro">{error}</Aviso>}

              <button
                type="submit"
                disabled={cargando || restante > 0}
                className="ui-boton pri w-full !min-h-[32px] !text-[14px]"
              >
                {restante > 0 ? `Esperá ${restante}s` : cargando ? 'Ingresando…' : 'Ingresar'}
              </button>

              <p className="text-center text-[11px] text-ui-txt">
                Enter para pasar de usuario a contraseña, y de nuevo para ingresar.
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
