/// <reference types="vite/client" />

// La inyecta `define` en electron.vite.config.ts a partir de package.json.
// No existe en tiempo de ejecucion: Vite la reemplaza por el literal.
declare const __APP_VERSION__: string;
