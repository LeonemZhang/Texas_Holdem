import { join } from 'node:path';

export const APP_NAME = 'Texas Holdem';
export const WINDOWS_APP_USER_MODEL_ID = 'com.leonemzhang.texasholdem';

export interface BrandableApplication {
  setName(name: string): void;
  setAppUserModelId(id: string): void;
}

export function applyApplicationBranding(
  application: BrandableApplication,
  platform = process.platform,
): void {
  application.setName(APP_NAME);
  if (platform === 'win32') {
    application.setAppUserModelId(WINDOWS_APP_USER_MODEL_ID);
  }
}

export function resolveAppIconPath(input: {
  readonly isPackaged: boolean;
  readonly resourcesPath: string;
  readonly mainDirectory: string;
}): string {
  return input.isPackaged
    ? join(input.resourcesPath, 'icon.ico')
    : join(input.mainDirectory, '../../build/icon.ico');
}
