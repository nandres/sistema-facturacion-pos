import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { createRequire } from 'node:module';

// La version sale de package.json y se inyecta en el bundle. Estaba escrita
// a mano en tres pantallas, que es una manera seria de mentirle al usuario
// sobre que version tiene instalada: al publicar la 1.1.0, el pie seguia
// diciendo v1.0.0 y nadie se entera hasta que alguien reporta un bug ya
// arreglado.
const { version } = createRequire(import.meta.url)('./package.json') as { version: string };

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
      },
    },
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') },
      },
    },
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(version),
    },
    build: {
      outDir: 'dist/renderer',
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') },
      },
    },
    resolve: {
      alias: { '@shared': resolve(__dirname, 'src/shared') },
    },
  },
});