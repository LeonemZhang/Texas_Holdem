import { describe, expect, it } from 'vitest';
import { createWindowOptions } from './window-options';

describe('Electron window security', () => {
  it('keeps the renderer sandboxed and isolated', () => {
    const options = createWindowOptions('C:/app/preload.js');

    expect(options.minWidth).toBe(360);
    expect(options.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: 'C:/app/preload.js',
    });
  });
});
