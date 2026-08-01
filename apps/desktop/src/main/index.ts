import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'node:path';
import type { DesktopRuntimeInfo } from '../shared/runtime';
import { DiscoveryScanInputSchema } from '../shared/runtime';
import { listDesktopNetworkInterfaces, scanLanRooms } from './network-services';
import { isTrustedRendererUrl } from './trusted-renderer';
import { createWindowOptions } from './window-options';

const developmentUrl = process.env.CLIENT_DEV_URL;

function registerRuntimeHandler() {
  const assertTrusted = (senderUrl: string | undefined) => {
    if (!senderUrl || !isTrustedRendererUrl(senderUrl, developmentUrl)) {
      throw new Error('Rejected IPC request from an untrusted renderer');
    }
  };
  ipcMain.handle('runtime:get-info', (event): DesktopRuntimeInfo => {
    const senderUrl = event.senderFrame?.url;
    assertTrusted(senderUrl);

    return {
      kind: 'desktop',
      appVersion: app.getVersion(),
      platform: process.platform,
    };
  });
  ipcMain.handle('network:list-interfaces', (event) => {
    assertTrusted(event.senderFrame?.url);
    return listDesktopNetworkInterfaces();
  });
  ipcMain.handle('network:scan-rooms', (event, rawInput: unknown) => {
    assertTrusted(event.senderFrame?.url);
    return scanLanRooms(DiscoveryScanInputSchema.parse(rawInput));
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
