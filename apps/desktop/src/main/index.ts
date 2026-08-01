import { app, BrowserWindow, dialog, ipcMain, utilityProcess } from 'electron';
import { join } from 'node:path';
import type { DesktopRuntimeInfo } from '../shared/runtime';
import {
  DiscoveryScanInputSchema,
  HostStartInputSchema,
  WindowRoomContextSchema,
} from '../shared/runtime';
import { listDesktopNetworkInterfaces, scanLanRooms } from './network-services';
import { isTrustedRendererUrl } from './trusted-renderer';
import { createWindowOptions } from './window-options';
import { HostProcessController } from './host-process-controller';
import { WindowCloseCoordinator } from './window-close-coordinator';

const developmentUrl = process.env.CLIENT_DEV_URL;
let mainWindow: BrowserWindow | null = null;
let windowCloseCoordinator: WindowCloseCoordinator | null = null;

function registerRuntimeHandler(hostController: HostProcessController) {
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
  ipcMain.handle('host:start', (event, rawInput: unknown) => {
    assertTrusted(event.senderFrame?.url);
    return hostController.start(HostStartInputSchema.parse(rawInput));
  });
  ipcMain.handle('host:stop', (event) => {
    assertTrusted(event.senderFrame?.url);
    hostController.stop();
  });
  ipcMain.handle('window:set-room-context', (event, rawContext: unknown) => {
    assertTrusted(event.senderFrame?.url);
    windowCloseCoordinator?.setContext(
      WindowRoomContextSchema.parse(rawContext),
    );
  });
  ipcMain.handle('window:complete-close', (event) => {
    assertTrusted(event.senderFrame?.url);
    windowCloseCoordinator?.completePlayerExit();
  });
  hostController.subscribe((exitEvent) => {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('host:exited', exitEvent);
    }
  });
}

async function createMainWindow() {
  const preloadPath = join(__dirname, '../preload/index.js');
  const window = new BrowserWindow(createWindowOptions(preloadPath));
  mainWindow = window;
  windowCloseCoordinator = new WindowCloseCoordinator({
    confirmPlayerExit: async () => {
      const result = await dialog.showMessageBox(window, {
        type: 'question',
        title: '退出房间',
        message: '是否退出当前房间？',
        detail: '退出后将离开座位；取消可继续游戏。',
        buttons: ['退出房间', '取消'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      return result.response === 0;
    },
    requestPlayerExit: () =>
      window.webContents.send('window:player-exit-requested'),
    closeWindow: () => window.close(),
  });
  window.on('close', (event) => windowCloseCoordinator?.handleClose(event));
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
      windowCloseCoordinator = null;
    }
  });
  window.once('ready-to-show', () => window.show());

  if (developmentUrl) {
    await window.loadURL(developmentUrl);
  } else {
    await window.loadFile(join(__dirname, '../../../client/dist/index.html'));
  }
}

void app.whenReady().then(async () => {
  const hostEntryPath = join(__dirname, '../../../host/dist/index.js');
  const hostController = new HostProcessController({
    dataDirectory: join(app.getPath('userData'), 'rooms'),
    staticDirectory: join(__dirname, '../../../client/dist'),
    spawn: ({ env }) =>
      utilityProcess.fork(hostEntryPath, [], {
        env: { ...process.env, ...env },
        serviceName: 'Texas Holdem Host',
        stdio: 'pipe',
      }),
  });
  registerRuntimeHandler(hostController);
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
