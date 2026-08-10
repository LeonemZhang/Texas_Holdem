import { describe, expect, it, vi } from 'vitest';
import { createWindowOptions, showWindowed } from './window-options';

describe('Electron window security', () => {
  it('keeps the renderer sandboxed and isolated', () => {
    const options = createWindowOptions(
      'C:/app/preload.js',
      'C:/app/resources/icon.ico',
      { width: 1920, height: 1080 },
    );

    expect(options.title).toBe('Texas Holdem');
    expect(options.icon).toBe('C:/app/resources/icon.ico');
    expect(options.width).toBe(1920);
    expect(options.height).toBe(1080);
    expect(options.fullscreen).toBe(false);
    expect(options.minWidth).toBe(360);
    expect(options.webPreferences).toMatchObject({
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: 'C:/app/preload.js',
    });
  });

  it('clamps the restored window target to the launch display work area', () => {
    const options = createWindowOptions(
      'C:/app/preload.js',
      'C:/app/resources/icon.ico',
      { width: 1366, height: 728 },
    );

    expect(options.width).toBe(1366);
    expect(options.height).toBe(728);
  });

  it('shows the regular window without maximizing it', () => {
    const calls: string[] = [];
    const window = {
      show: vi.fn(() => calls.push('show')),
    };

    showWindowed(window);

    expect(calls).toEqual(['show']);
  });
});
