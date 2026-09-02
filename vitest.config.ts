import { defineConfig } from 'vitest/config';

// Las pruebas viven al lado del código que prueban, no en un árbol paralelo:
// un archivo sin `.test.ts` hermano se nota al abrir la carpeta.
//
// Entorno `node` porque lo que se prueba es lógica pura y el proceso main. La
// interfaz no se monta acá: lo que tenía consecuencia fiscal ya salió de
// `VentaPOS` a `shared/calculos/fiscal.ts`, que es donde se prueba.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    reporters: ['default'],
  },
});
