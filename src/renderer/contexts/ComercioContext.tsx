import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { COMERCIO_DEFECTO, lineaRuc, type Comercio } from '../../shared/config/comercio';

/**
 * Datos del comercio para el renderer.
 *
 * Van por contexto y no por import directo porque **ya no son constantes de
 * compilacion**: se configuran por instalacion y se guardan en el proceso main.
 * Tres pantallas los muestran --login, barra de titulo y la vista previa del
 * ticket en caja-- y las tres tienen que ver lo mismo en el momento en que
 * alguien los cambia desde Configuracion, sin reiniciar.
 */
interface ComercioCtx {
  comercio: Comercio;
  /** "RUC: 123456-0", o cadena vacía si no hay RUC cargado. */
  rucLinea: string;
  /** La usa la pantalla de Configuración después de guardar. */
  refrescar: () => Promise<void>;
}

const Ctx = createContext<ComercioCtx>({
  comercio: COMERCIO_DEFECTO,
  rucLinea: '',
  refrescar: async () => {},
});

export function ComercioProvider({ children }: { children: ReactNode }): JSX.Element {
  const [comercio, setComercio] = useState<Comercio>(COMERCIO_DEFECTO);

  async function refrescar() {
    try {
      const r = await window.api.config.obtenerComercio();
      if (r.ok) setComercio(r.data);
    } catch { /* si falla queda el valor por defecto */ }
  }

  useEffect(() => { refrescar(); }, []);

  return (
    <Ctx.Provider value={{ comercio, rucLinea: lineaRuc(comercio.ruc), refrescar }}>
      {children}
    </Ctx.Provider>
  );
}

export function useComercio(): ComercioCtx {
  return useContext(Ctx);
}
