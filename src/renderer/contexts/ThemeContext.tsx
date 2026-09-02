import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

type Tema = 'oscuro' | 'claro';

interface TemaCtx {
  tema: Tema;
  toggle: () => void;
}

const Ctx = createContext<TemaCtx>({ tema: 'oscuro', toggle: () => {} });

export function TemaProvider({ children }: { children: ReactNode }): JSX.Element {
  const [tema, setTema] = useState<Tema>(() => {
    try { return (localStorage.getItem('tema') as Tema) || 'oscuro'; } catch { return 'oscuro'; }
  });

  useEffect(() => {
    const html = document.documentElement;
    if (tema === 'claro') {
      html.classList.add('tema-claro');
    } else {
      html.classList.remove('tema-claro');
    }
    try { localStorage.setItem('tema', tema); } catch { /* ignore */ }
  }, [tema]);

  const toggle = () => setTema((t) => (t === 'oscuro' ? 'claro' : 'oscuro'));

  return <Ctx.Provider value={{ tema, toggle }}>{children}</Ctx.Provider>;
}

export function useTema(): TemaCtx {
  return useContext(Ctx);
}
