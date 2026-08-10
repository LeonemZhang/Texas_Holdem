import type { BrowserWindowConstructorOptions } from 'electron';

export interface ShowableWindow {
  show(): void;
}

export interface WindowWorkAreaSize {
  readonly width: number;
  readonly height: number;
}

const initialWindowTarget = {
  width: 1920,
  height: 1080,
} as const;

export function showWindowed(window: ShowableWindow): void {
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
    width: Math.min(initialWindowTarget.width, workAreaSize.width),
    height: Math.min(initialWindowTarget.height, workAreaSize.height),
    minWidth: 360,
    minHeight: 700,
    fullscreen: false,
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
