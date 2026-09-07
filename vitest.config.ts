import { defineConfig } from 'vitest/config';

// Las pruebas viven al lado del código que prueban, no en un árbol paralelo:
// un archivo sin `.test.ts` hermano se nota al abrir la carpeta.
//
// Entorno `node` porque lo que se prueba es lógica pura y el proceso main. La
// interfaz no se monta acá: lo que tenía consecuencia fiscal ya salió de
// `VentaPOS` a `shared/calculos/fiscal.ts`, que es donde se prueba.
export default defineConfig({
  test: {
    // Entorno `node` por defecto. Las pruebas de pantalla piden `jsdom` en su
    // propio encabezado (`@vitest-environment jsdom`), porque montar un DOM
    // para probar aritmética sería pagar por nada.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    reporters: ['default'],

    // ── Zona horaria fija ──────────────────────────────────────────────────
    //
    // El ticket imprime la fecha con `toLocaleString('es-PY', …)`, que usa la
    // zona horaria de la máquina. Sin fijarla, los snapshots de bytes pasan en
    // Asunción y fallan en el CI, que corre en UTC: el mismo instante sale
    // como 11:30 acá y 14:30 allá.
    //
    // Se fija a la del comercio, no a UTC, porque la hora que interesa
    // verificar es la que el cliente lee en el papel.
    env: {
      TZ: 'America/Asuncion',
    },
  },
});
