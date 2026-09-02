import { config } from 'dotenv';
import { app, BrowserWindow, Menu } from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

// Cargar .env: primero desde resources (producción), luego desde CWD (desarrollo)
config({ path: resolve(app.isPackaged ? process.resourcesPath : process.cwd(), '.env') });
import { registrarHandlersIPC } from './ipc/index';
import { cacheProductos } from './services/offlineService';
import { log } from './services/logger';


// Evitar múltiples instancias
const lock = app.requestSingleInstanceLock();
if (!lock) {
  app.quit();
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const URL_RENDERER_DEV = process.env.ELECTRON_RENDERER_URL;

async function crearVentana(): Promise<void> {
  Menu.setApplicationMenu(null);

  const ventana = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0f172a',
    show: false,
    frame: false,
    webPreferences: {
      preload: resolve(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  ventana.once('ready-to-show', () => ventana.show());

  // ── Endurecimiento de la ventana ────────────────────────────────────────
  //
  // La caja no navega a ningún lado: carga su propio HTML y se queda ahí. Todo
  // lo demás se niega, en vez de confiar en que nadie va a intentarlo. Sin
  // esto, un nombre de producto con un enlace --o cualquier HTML que entre por
  // un import de Excel-- puede sacar la ventana de la app o abrir uno nuevo
  // con acceso al preload.

  // Nada de ventanas nuevas: ni window.open, ni target="_blank".
  ventana.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Nada de navegar fuera del origen propio.
  ventana.webContents.on('will-navigate', (evento, url) => {
    const permitido = URL_RENDERER_DEV
      ? url.startsWith(URL_RENDERER_DEV)
      : url.startsWith('file://');
    if (!permitido) {
      evento.preventDefault();
      log.warn(`[seguridad] navegación bloqueada hacia ${url}`);
    }
  });

  // Nada de adjuntar webviews.
  ventana.webContents.on('will-attach-webview', (evento) => {
    evento.preventDefault();
    log.warn('[seguridad] intento de adjuntar un <webview> bloqueado');
  });

  // Un POS no necesita cámara, micrófono, ubicación ni notificaciones.
  ventana.webContents.session.setPermissionRequestHandler((_wc, permiso, callback) => {
    log.warn(`[seguridad] permiso denegado: ${permiso}`);
    callback(false);
  });

  if (URL_RENDERER_DEV) {
    await ventana.loadURL(URL_RENDERER_DEV);
    ventana.webContents.openDevTools({ mode: 'detach' });
  } else {
    await ventana.loadFile(resolve(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  log.info('Iniciando Sistema de Facturación');
  registrarHandlersIPC();

  // Respaldo offline del catalogo: se llena al arrancar y se refresca en
  // background. Sin este refresco periodico, la caja se queda sin conexion
  // trabajando con los precios del dia que se instalo el sistema.
  const refrescarCatalogo = (): void => {
    cacheProductos(true).catch((err) => log.error('[main] error al cachear productos', err));
  };
  refrescarCatalogo();
  const timerCatalogo = setInterval(refrescarCatalogo, 10 * 60 * 1000);
  app.on('before-quit', () => clearInterval(timerCatalogo));

  // Backup y actualización al iniciar (en background)
  import('./services/backupService').then(({ realizarBackup }) => realizarBackup());
  import('./services/autoUpdater').then(({ checkForUpdates }) => {
    checkForUpdates().then((info) => {
      if (info) log.info(`[main] Actualización disponible: ${info.version}`);
    });
  });

  await crearVentana();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) crearVentana();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

let cerrando = false;
app.on('before-quit', (e) => {
  if (cerrando) return;
  e.preventDefault();
  cerrando = true;
  import('./services/backupService').then(async ({ realizarBackup }) => {
    try {
      await realizarBackup();
    } catch { /* backup no crítico */ }
    app.quit();
  });
});