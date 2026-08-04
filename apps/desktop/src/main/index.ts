import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  utilityProcess,
} from 'electron';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DesktopRuntimeInfo } from '../shared/runtime';
import {
  ClipboardImageDataUrlSchema,
  DiscoveryScanInputSchema,
  HostStartInputSchema,
  RoomRecordRecoveryInputSchema,
  WindowRoomContextSchema,
} from '../shared/runtime';
import { listDesktopNetworkInterfaces, scanLanRooms } from './network-services';
import { isTrustedRendererUrl } from './trusted-renderer';
import { createWindowOptions, showWindowMaximized } from './window-options';
import { HostProcessController } from './host-process-controller';
import { WindowCloseCoordinator } from './window-close-coordinator';
import {
  guardMainWindowNavigation,
  guardNewWindowOpen,
} from './external-navigation';
import { hideApplicationMenu } from './application-menu';
import { recoverRoomRecordFromHost } from './room-record-recovery';

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
  ipcMain.handle('host:get-current', (event) => {
    assertTrusted(event.senderFrame?.url);
    return hostController.current();
  });
  ipcMain.handle('host:stop', async (event) => {
    assertTrusted(event.senderFrame?.url);
    await hostController.stop();
  });
  ipcMain.handle('room-records:open', async (event) => {
    assertTrusted(event.senderFrame?.url);
    await hostController.startManagement();
  });
  ipcMain.handle('clipboard:write-image', (event, rawImageDataUrl: unknown) => {
    assertTrusted(event.senderFrame?.url);
    const image = nativeImage.createFromDataURL(
      ClipboardImageDataUrlSchema.parse(rawImageDataUrl),
    );
    if (image.isEmpty()) throw new Error('Invalid clipboard image');
    clipboard.writeImage(image);
  });
  ipcMain.handle(
    'room-records:list',
    async (event, includeArchived: unknown) => {
      assertTrusted(event.senderFrame?.url);
      if (typeof includeArchived !== 'boolean')
        throw new Error('Invalid archive filter');
      const result = await hostController.manage({
        protocolVersion: '1',
        requestId: randomUUID(),
        type: 'room-record.list',
        includeArchived,
      });
      if (!result || typeof result !== 'object' || !('records' in result)) {
        throw new Error('Invalid room record list response');
      }
      return result.records;
    },
  );
  ipcMain.handle('room-records:recover', async (event, rawInput: unknown) => {
    assertTrusted(event.senderFrame?.url);
    return recoverRoomRecordFromHost({
      controller: hostController,
      input: RoomRecordRecoveryInputSchema.parse(rawInput),
      networkInterfaces: listDesktopNetworkInterfaces,
      createRequestId: randomUUID,
    });
  });
  ipcMain.handle(
    'room-records:close-running',
    async (event, roomId: unknown) => {
      assertTrusted(event.senderFrame?.url);
      if (typeof roomId !== 'string' || !roomId.trim())
        throw new Error('Invalid room ID');
      await hostController.manage({
        protocolVersion: '1',
        requestId: randomUUID(),
        type: 'room-record.close-running',
        roomId,
      });
    },
  );
  for (const [channel, type] of [
    ['room-records:archive', 'room-record.archive'],
    ['room-records:restore', 'room-record.restore'],
    ['room-records:delete', 'room-record.delete'],
  ] as const) {
    ipcMain.handle(channel, async (event, roomId: unknown) => {
      assertTrusted(event.senderFrame?.url);
      if (typeof roomId !== 'string' || !roomId.trim())
        throw new Error('Invalid room ID');
      await hostController.manage({
        protocolVersion: '1',
        requestId: randomUUID(),
        type,
        roomId,
      });
    });
  }
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
    confirmHostClose: async () => {
      const result = await dialog.showMessageBox(window, {
        type: 'warning',
        title: '关闭房间',
        message: '是否关闭房间和当前对局？',
        detail: '确认后将先正常关闭房间并保存状态；取消可继续游戏。',
        buttons: ['关闭房间', '取消'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      return result.response === 0;
    },
    requestPlayerExit: () =>
      window.webContents.send('window:player-exit-requested'),
    requestHostClose: () =>
      window.webContents.send('window:host-close-requested'),
    closeWindow: () => window.close(),
  });
  window.on('close', (event) => windowCloseCoordinator?.handleClose(event));
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
      windowCloseCoordinator = null;
    }
  });
  window.webContents.on('will-navigate', (event, url) => {
    guardMainWindowNavigation({
      url,
      isTrustedRendererUrl: (candidate) =>
        isTrustedRendererUrl(candidate, developmentUrl),
      preventDefault: () => event.preventDefault(),
      openExternal: (candidate) => shell.openExternal(candidate),
    });
  });
  window.webContents.setWindowOpenHandler(({ url }) =>
    guardNewWindowOpen(url, (candidate) => shell.openExternal(candidate)),
  );
  window.once('ready-to-show', () => showWindowMaximized(window));

  if (developmentUrl) {
    await window.loadURL(developmentUrl);
  } else {
    await window.loadFile(
      app.isPackaged
        ? join(process.resourcesPath, 'client/index.html')
        : join(__dirname, '../../../client/dist/index.html'),
    );
  }
}

void app.whenReady().then(async () => {
  hideApplicationMenu(Menu);
  const hostEntryPath = app.isPackaged
    ? join(process.resourcesPath, 'host/index.mjs')
    : join(__dirname, '../host/index.mjs');
  const hostController = new HostProcessController({
    dataDirectory: join(app.getPath('userData'), 'rooms'),
    staticDirectory: app.isPackaged
      ? join(process.resourcesPath, 'client')
      : join(__dirname, '../../../client/dist'),
    spawn: ({ env }) =>
      utilityProcess.fork(hostEntryPath, [], {
        env: { ...process.env, ...env, HOST_PARENT_PID: String(process.pid) },
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
