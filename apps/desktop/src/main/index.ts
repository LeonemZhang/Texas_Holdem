import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import type { DesktopRuntimeInfo } from '../shared/runtime';
import { isTrustedRendererUrl } from './trusted-renderer';
import { createWindowOptions } from './window-options';

const developmentUrl = process.env.CLIENT_DEV_URL;

function registerRuntimeHandler() {
  ipcMain.handle('runtime:get-info', (event): DesktopRuntimeInfo => {
    const senderUrl = event.senderFrame?.url;
    if (!senderUrl || !isTrustedRendererUrl(senderUrl, developmentUrl)) {
      throw new Error('Rejected IPC request from an untrusted renderer');
    }

    return {
      kind: 'desktop',
      appVersion: app.getVersion(),
      platform: process.platform,
    };
  });
}

async function createMainWindow() {
  const preloadPath = join(__dirname, '../preload/index.js');
  const window = new BrowserWindow(createWindowOptions(preloadPath));
  window.once('ready-to-show', () => window.show());

  if (developmentUrl) {
    await window.loadURL(developmentUrl);
  } else {
    await window.loadFile(join(__dirname, '../../../client/dist/index.html'));
  }
}

void app.whenReady().then(async () => {
  registerRuntimeHandler();
  await createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
