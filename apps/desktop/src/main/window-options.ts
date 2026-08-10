import type { BrowserWindowConstructorOptions } from 'electron';

export interface MaximizableWindow {
  maximize(): void;
  show(): void;
}

export interface WindowWorkAreaSize {
  readonly width: number;
  readonly height: number;
}

const restoredWindowTarget = {
  width: 1920,
  height: 1080,
} as const;

export function showWindowMaximized(window: MaximizableWindow): void {
  window.maximize();
  window.show();
}

export function createWindowOptions(
  preloadPath: string,
  iconPath: string,
  workAreaSize: WindowWorkAreaSize,
): BrowserWindowConstructorOptions {
  return {
    title: 'Texas Holdem',
    icon: iconPath,
    width: Math.min(restoredWindowTarget.width, workAreaSize.width),
    height: Math.min(restoredWindowTarget.height, workAreaSize.height),
    minWidth: 360,
    minHeight: 700,
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
