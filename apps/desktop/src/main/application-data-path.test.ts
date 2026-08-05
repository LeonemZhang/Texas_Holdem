import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  APPLICATION_DATA_DIRECTORY_NAME,
  configureApplicationUserData,
} from './application-data-path';

describe('desktop application data path', () => {
  it('anchors user data under the operating system application-data directory', () => {
    const appDataDirectory = join('profile', 'AppData', 'Roaming');
    const userDataDirectory = join(
      appDataDirectory,
      APPLICATION_DATA_DIRECTORY_NAME,
    );
    const application = {
      getPath: vi.fn(() => appDataDirectory),
      setPath: vi.fn(),
    };
    const ensureDirectory = vi.fn();

    expect(configureApplicationUserData(application, ensureDirectory)).toBe(
      userDataDirectory,
    );
    expect(application.getPath).toHaveBeenCalledWith('appData');
    expect(ensureDirectory).toHaveBeenCalledWith(userDataDirectory, {
      recursive: true,
    });
    expect(application.setPath).toHaveBeenCalledWith(
      'userData',
      userDataDirectory,
    );
    expect(application.setPath).toHaveBeenCalledWith(
      'sessionData',
      userDataDirectory,
    );
  });
});
