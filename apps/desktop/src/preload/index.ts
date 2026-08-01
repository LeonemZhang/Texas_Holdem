import { contextBridge, ipcRenderer } from 'electron';
import {
  DiscoveryScanInputSchema,
  HostStartInputSchema,
  type DesktopBridge,
  type DiscoveryScanInput,
  type HostServiceExitEvent,
  type HostStartInput,
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
