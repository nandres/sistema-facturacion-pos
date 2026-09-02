import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { TemaProvider } from './contexts/ThemeContext';
import { ComercioProvider } from './contexts/ComercioContext';
import './styles/index.css';

const contenedor = document.getElementById('root');
if (!contenedor) {
  throw new Error('No se encontró el elemento #root en index.html');
}

createRoot(contenedor).render(
  <React.StrictMode>
    <TemaProvider>
      <ComercioProvider>
        <App />
      </ComercioProvider>
    </TemaProvider>
  </React.StrictMode>,
);