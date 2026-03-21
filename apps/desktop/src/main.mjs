import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { app, BrowserWindow, dialog } from 'electron';

import {
  createManagedServiceController,
  formatManagedServiceFailure
} from './service-runtime.mjs';

const desktopDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(desktopDir, '..', '..', '..');
const serviceEntrypoint = join(repoRoot, 'apps', 'service', 'src', 'server.mjs');
const serviceHost = '127.0.0.1';
const servicePort = '43100';
let mainWindow = null;
let shutdownRequested = false;
let shutdownPromise = null;

const managedService = createManagedServiceController({
  getUserDataPath: () => app.getPath('userData'),
  repoRoot,
  serviceEntrypoint,
  serviceHost,
  servicePort
});

function showStartupFailure(error) {
  console.error(error);
  dialog.showErrorBox(
    'NEXUS startup failed',
    formatManagedServiceFailure(error, managedService.getLastLaunchFailure())
  );
}

async function createMainWindow() {
  const service = await managedService.ensureStarted();
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
    return mainWindow;
  }

  const window = new BrowserWindow({
    width: 1480,
    height: 980,
    backgroundColor: '#edf3f1',
    webPreferences: {
      contextIsolation: true,
      sandbox: true
    }
  });
  mainWindow = window;
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  await window.loadURL(service.url);
  return window;
}

async function shutdownApp(exitCode = 0) {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  shutdownPromise = (async () => {
    try {
      await managedService.stop();
    }
    catch (error) {
      console.error(error);
    }
    finally {
      app.exit(exitCode);
    }
  })();

  return shutdownPromise;
}

app.whenReady().then(() => {
  createMainWindow().catch((error) => {
    showStartupFailure(error);
    shutdownApp(1);
  });
  app.on('activate', () => {
    createMainWindow().catch(showStartupFailure);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', (event) => {
  if (shutdownRequested) {
    return;
  }

  shutdownRequested = true;
  event.preventDefault();
  shutdownApp(process.exitCode ?? 0);
});
