import { contextBridge, ipcRenderer } from 'electron';
import type { DesktopBridge } from '../shared/runtime';

const bridge: DesktopBridge = Object.freeze({
  getRuntimeInfo: () => ipcRenderer.invoke('runtime:get-info'),
});

contextBridge.exposeInMainWorld('texasHoldemDesktop', bridge);
