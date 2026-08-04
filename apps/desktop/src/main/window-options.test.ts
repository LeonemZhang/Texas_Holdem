import { describe, expect, it, vi } from 'vitest';
import { createWindowOptions, showWindowMaximized } from './window-options';

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

  it('maximizes the regular window before showing it', () => {
    const calls: string[] = [];
    const window = {
      maximize: vi.fn(() => calls.push('maximize')),
      show: vi.fn(() => calls.push('show')),
    };

    showWindowMaximized(window);

    expect(calls).toEqual(['maximize', 'show']);
  });
});
