// ESLint 9 — flat config.
// Sin type-aware linting a proposito: el chequeo de tipos lo hace `npm run
// typecheck` (main + renderer), que es mas rapido y mas preciso para eso.
// Aca solo van las reglas sintacticas que atrapan errores antes de compilar.
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

/** Globals del proceso Node (main + preload + scripts). */
const globalsNode = {
  process: 'readonly',
  console: 'readonly',
  Buffer: 'readonly',
  __dirname: 'readonly',
  __filename: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  setImmediate: 'readonly',
  fetch: 'readonly',
  crypto: 'readonly',
  AbortController: 'readonly',
  URL: 'readonly',
  queueMicrotask: 'readonly',
  NodeJS: 'readonly',
};

/** Globals del renderer (Chromium dentro de Electron). */
const globalsBrowser = {
  // La inyecta Vite con `define` a partir de package.json: en el codigo
  // fuente no existe, en el bundle es un literal. Ver electron.vite.config.ts.
  __APP_VERSION__: 'readonly',
  window: 'readonly',
  document: 'readonly',
  console: 'readonly',
  navigator: 'readonly',
  localStorage: 'readonly',
  fetch: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
  Audio: 'readonly',
  Blob: 'readonly',
  URL: 'readonly',
  alert: 'readonly',
  confirm: 'readonly',
  prompt: 'readonly',
  AudioContext: 'readonly',
  webkitAudioContext: 'readonly',
  queueMicrotask: 'readonly',
  NodeJS: 'readonly',
  KeyboardEvent: 'readonly',
  getComputedStyle: 'readonly',
  MouseEvent: 'readonly',
  Node: 'readonly',
  Element: 'readonly',
  HTMLInputElement: 'readonly',
  HTMLDivElement: 'readonly',
  HTMLButtonElement: 'readonly',
  HTMLSelectElement: 'readonly',
  HTMLTableRowElement: 'readonly',
  HTMLElement: 'readonly',
  JSX: 'readonly',
  React: 'readonly',
};

const reglasComunes = {
  // Variables sin uso: el argumento con guion bajo (_evt) es intencional.
  'no-unused-vars': 'off',
  '@typescript-eslint/no-unused-vars': [
    'warn',
    { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
  ],
  // `any` se tolera con aviso: hay 19 en el codigo y se van sacando por fase.
  '@typescript-eslint/no-explicit-any': 'warn',
  'no-undef': 'error',
  'no-redeclare': 'error',
  'no-dupe-keys': 'error',
  'no-unreachable': 'error',
  'no-constant-condition': ['error', { checkLoops: false }],
  'prefer-const': 'warn',
  eqeqeq: ['warn', 'smart'],
  'no-debugger': 'error',
};

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'out/**',
      'build/**',
      'Backup/**',
      '.ui_backup*/**',
      'Ideas_PrimerSoftware/**',
      'supabase/**',
      '*.config.js',
    ],
  },

  // Proceso principal, preload, tipos compartidos y scripts.
  {
    files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'src/shared/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { project: false },
      globals: globalsNode,
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: reglasComunes,
  },

  // Renderer (React).
  {
    files: ['src/renderer/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      parserOptions: { project: false, ecmaFeatures: { jsx: true } },
      globals: globalsBrowser,
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: reglasComunes,
  },
];
