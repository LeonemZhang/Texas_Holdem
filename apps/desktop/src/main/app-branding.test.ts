import { describe, expect, it, vi } from 'vitest';
import { join } from 'node:path';

import {
  APP_NAME,
  WINDOWS_APP_USER_MODEL_ID,
  applyApplicationBranding,
  resolveAppIconPath,
} from './app-branding';

describe('desktop application branding', () => {
  it('sets the product name and Windows application identity', () => {
    const application = {
      setName: vi.fn(),
      setAppUserModelId: vi.fn(),
    };

    applyApplicationBranding(application, 'win32');

    expect(application.setName).toHaveBeenCalledWith(APP_NAME);
    expect(application.setAppUserModelId).toHaveBeenCalledWith(
      WINDOWS_APP_USER_MODEL_ID,
    );
  });

  it('does not apply a Windows identity on other platforms', () => {
    const application = {
      setName: vi.fn(),
      setAppUserModelId: vi.fn(),
    };

    applyApplicationBranding(application, 'linux');

    expect(application.setName).toHaveBeenCalledWith(APP_NAME);
    expect(application.setAppUserModelId).not.toHaveBeenCalled();
  });

  it('resolves development and packaged icons from real file paths', () => {
    const resourcesPath = join('app', 'resources');
    const developmentMainDirectory = join(
      'repo',
      'apps',
      'desktop',
      'dist',
      'main',
    );
    expect(
      resolveAppIconPath({
        isPackaged: false,
        resourcesPath,
        mainDirectory: developmentMainDirectory,
      }),
    ).toBe(join('repo', 'apps', 'desktop', 'build', 'icon.ico'));
    expect(
      resolveAppIconPath({
        isPackaged: true,
        resourcesPath,
        mainDirectory: join(resourcesPath, 'app.asar', 'dist', 'main'),
      }),
    ).toBe(join(resourcesPath, 'icon.ico'));
  });
});
