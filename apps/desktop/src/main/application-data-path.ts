import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const APPLICATION_DATA_DIRECTORY_NAME = 'Texas Holdem';

export interface ApplicationDataPathApi {
  getPath(name: 'appData'): string;
  setPath(name: 'userData' | 'sessionData', path: string): void;
}

export function configureApplicationUserData(
  application: ApplicationDataPathApi,
  ensureDirectory: typeof mkdirSync = mkdirSync,
): string {
  const userDataDirectory = join(
    application.getPath('appData'),
    APPLICATION_DATA_DIRECTORY_NAME,
  );
  ensureDirectory(userDataDirectory, { recursive: true });
  application.setPath('userData', userDataDirectory);
  application.setPath('sessionData', userDataDirectory);
  return userDataDirectory;
}
