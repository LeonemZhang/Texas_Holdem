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
  stopHostService: () => ipcRenderer.invoke('host:stop'),
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
