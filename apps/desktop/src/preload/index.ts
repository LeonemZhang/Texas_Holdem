import { contextBridge, ipcRenderer } from 'electron';
import {
  DiscoveryScanInputSchema,
  HostStartInputSchema,
  WindowRoomContextSchema,
  type DesktopBridge,
  type DiscoveryScanInput,
  type HostServiceExitEvent,
  type HostStartInput,
  type WindowRoomContext,
} from '../shared/runtime';

const bridge: DesktopBridge = Object.freeze({
  getRuntimeInfo: () => ipcRenderer.invoke('runtime:get-info'),
  listNetworkInterfaces: () => ipcRenderer.invoke('network:list-interfaces'),
  scanLanRooms: (input: DiscoveryScanInput) =>
    ipcRenderer.invoke(
      'network:scan-rooms',
      DiscoveryScanInputSchema.parse(input),
    ),
  startHostService: (input: HostStartInput) =>
    ipcRenderer.invoke('host:start', HostStartInputSchema.parse(input)),
  getActiveHostService: () => ipcRenderer.invoke('host:get-current'),
  stopHostService: () => ipcRenderer.invoke('host:stop'),
  listRoomRecords: (includeArchived: boolean) =>
    ipcRenderer.invoke('room-records:list', includeArchived),
  recoverRoomRecord: (roomId: string) =>
    ipcRenderer.invoke('room-records:recover', roomId),
  archiveRoomRecord: (roomId: string) =>
    ipcRenderer.invoke('room-records:archive', roomId),
  restoreRoomRecord: (roomId: string) =>
    ipcRenderer.invoke('room-records:restore', roomId),
  deleteRoomRecord: (roomId: string) =>
    ipcRenderer.invoke('room-records:delete', roomId),
  onHostServiceExited: (listener: (event: HostServiceExitEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, value: unknown) => {
      const parsed = zHostExitEvent(value);
      if (parsed) listener(parsed);
    };
    ipcRenderer.on('host:exited', handler);
    return () => ipcRenderer.off('host:exited', handler);
  },
  setWindowRoomContext: (context: WindowRoomContext) =>
    ipcRenderer.invoke(
      'window:set-room-context',
      WindowRoomContextSchema.parse(context),
    ),
  onPlayerExitRequested: (listener: () => void | Promise<void>) => {
    const handler = async () => {
      await listener();
      await ipcRenderer.invoke('window:complete-close');
    };
    ipcRenderer.on('window:player-exit-requested', handler);
    return () => ipcRenderer.off('window:player-exit-requested', handler);
  },
  onHostCloseRequested: (listener: () => void | Promise<void>) => {
    const handler = async () => {
      await listener();
      await ipcRenderer.invoke('window:complete-close');
    };
    ipcRenderer.on('window:host-close-requested', handler);
    return () => ipcRenderer.off('window:host-close-requested', handler);
  },
});

function zHostExitEvent(value: unknown): HostServiceExitEvent | null {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof (value as HostServiceExitEvent).expected !== 'boolean' ||
    !Number.isInteger((value as HostServiceExitEvent).exitCode)
  ) {
    return null;
  }
  return Object.freeze({ ...(value as HostServiceExitEvent) });
}

contextBridge.exposeInMainWorld('texasHoldemDesktop', bridge);
