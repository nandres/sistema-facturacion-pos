/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        pos: {
          bg: 'var(--bg-primary)',
          panel: 'var(--bg-secondary)',
          // El acento del sistema es el azul de --ui-sel. Habia un verde
          // suelto aca que no correspondia a ningun rol del tema.
          accent: 'var(--ui-sel)',
          danger: 'var(--ui-peligro)',
          warning: 'var(--ui-alerta)',
        },
        tok: {
          bg: 'var(--bg-primary)',
          sec: 'var(--bg-secondary)',
          ter: 'var(--bg-tertiary)',
          el: 'var(--bg-element)',
          panel: 'var(--panel-bg)',
          hdr: 'var(--header-bg)',
          nav: 'var(--nav-bg)',
          tp: 'var(--text-primary)',
          ts: 'var(--text-secondary)',
          tm: 'var(--text-muted)',
          bd: 'var(--border-default)',
          bs: 'var(--border-subtle)',
        },
        // Sistema de diseño de la aplicacion. Los roles estan en index.css y
        // cambian con el tema; aca solo se les da nombre para Tailwind.
        ui: {
          fondo: 'var(--ui-fondo)',
          sup: 'var(--ui-sup)',
          alt: 'var(--ui-sup-alt)',
          barra: 'var(--ui-barra)',
          alta: 'var(--ui-barra-alta)',
          hund: 'var(--ui-hundido)',
          bd: 'var(--ui-bd)',
          bdf: 'var(--ui-bd-fuerte)',
          tx: 'var(--ui-tx)',
          txs: 'var(--ui-tx-sec)',
          txt: 'var(--ui-tx-ten)',
          inv: 'var(--ui-tx-inv)',
          sel: 'var(--ui-sel)',
          sels: 'var(--ui-sel-suave)',
          foco: 'var(--ui-foco)',
          ok: 'var(--ui-ok)',
          oks: 'var(--ui-ok-suave)',
          pel: 'var(--ui-peligro)',
          pels: 'var(--ui-peligro-suave)',
          ale: 'var(--ui-alerta)',
          ales: 'var(--ui-alerta-suave)',
          inf: 'var(--ui-info)',
          infs: 'var(--ui-info-suave)',
        },
      },
      // La interfaz usa una sola familia (--ui-ui, aplicada en body). Esta
      // monoespaciada existe solo para la vista previa del ticket, que imita
      // el papel termico de 32 columnas.
      fontFamily: {
        mono: ['Roboto Mono', 'JetBrains Mono', 'ui-monospace', 'Cascadia Mono',
               'Consolas', 'DejaVu Sans Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};