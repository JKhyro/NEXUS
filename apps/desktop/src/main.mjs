import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdir } from 'node:fs/promises';

import { app, BrowserWindow } from 'electron';

const desktopDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(desktopDir, '..', '..', '..');
const serviceEntrypoint = join(repoRoot, 'apps', 'service', 'src', 'server.mjs');
const serviceHost = '127.0.0.1';
const servicePort = '43100';
let serviceProcess = null;

async function waitForService(url) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) {
        return;
      }
    }
    catch {
      // Wait for the service process to come up.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error('Timed out waiting for the local NEXUS service.');
}

async function startManagedService() {
  const runtimeDir = join(app.getPath('userData'), 'runtime');
  await mkdir(runtimeDir, { recursive: true });
  serviceProcess = spawn('node', [serviceEntrypoint], {
    cwd: repoRoot,
    env: {
      ...process.env,
      NEXUS_HOST: serviceHost,
      NEXUS_PORT: servicePort,
      NEXUS_DATA_DIR: runtimeDir
    },
    stdio: 'ignore'
  });

  serviceProcess.unref();
  await waitForService(`http://${serviceHost}:${servicePort}`);
}

async function createMainWindow() {
  await startManagedService();
  const window = new BrowserWindow({
    width: 1480,
    height: 980,
    backgroundColor: '#edf3f1',
    webPreferences: {
      contextIsolation: true,
      sandbox: true
    }
  });

  await window.loadURL(`http://${serviceHost}:${servicePort}/`);
}

app.whenReady().then(() => {
  createMainWindow().catch((error) => {
    console.error(error);
    app.quit();
  });
});

app.on('before-quit', () => {
  if (serviceProcess && !serviceProcess.killed) {
    serviceProcess.kill();
  }
});
