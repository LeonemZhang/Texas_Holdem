import type { BrowserWindowConstructorOptions } from 'electron';

export interface MaximizableWindow {
  maximize(): void;
  show(): void;
}

export function showWindowMaximized(window: MaximizableWindow): void {
  window.maximize();
  window.show();
}

export function createWindowOptions(
  preloadPath: string,
  iconPath: string,
): BrowserWindowConstructorOptions {
  return {
    title: 'Texas Holdem',
    icon: iconPath,
    width: 1280,
    height: 800,
    minWidth: 360,
    minHeight: 640,
    backgroundColor: '#04110e',
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: preloadPath,
    },
  };
}
