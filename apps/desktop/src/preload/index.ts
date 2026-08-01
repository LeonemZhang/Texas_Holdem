import { contextBridge, ipcRenderer } from 'electron';
import {
  DiscoveryScanInputSchema,
  type DesktopBridge,
  type DiscoveryScanInput,
} from '../shared/runtime';

const bridge: DesktopBridge = Object.freeze({
  getRuntimeInfo: () => ipcRenderer.invoke('runtime:get-info'),
  listNetworkInterfaces: () => ipcRenderer.invoke('network:list-interfaces'),
  scanLanRooms: (input: DiscoveryScanInput) =>
    ipcRenderer.invoke(
      'network:scan-rooms',
      DiscoveryScanInputSchema.parse(input),
    ),
});

contextBridge.exposeInMainWorld('texasHoldemDesktop', bridge);
