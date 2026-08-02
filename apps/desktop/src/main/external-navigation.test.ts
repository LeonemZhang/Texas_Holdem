import { describe, expect, it, vi } from 'vitest';

import {
  guardMainWindowNavigation,
  guardNewWindowOpen,
} from './external-navigation';

describe('external navigation guard', () => {
  it('keeps navigation inside the trusted renderer', () => {
    const preventDefault = vi.fn();
    const openExternal = vi.fn(async () => undefined);

    guardMainWindowNavigation({
      url: 'file:///C:/TexasHoldem/client/index.html',
      isTrustedRendererUrl: () => true,
      preventDefault,
      openExternal,
    });

    expect(preventDefault).not.toHaveBeenCalled();
    expect(openExternal).not.toHaveBeenCalled();
  });

  it('opens an external HTTP address in the system browser instead of replacing the main window', async () => {
    const preventDefault = vi.fn();
    const openExternal = vi.fn(async () => undefined);

    guardMainWindowNavigation({
      url: 'http://10.126.126.1:32100',
      isTrustedRendererUrl: () => false,
      preventDefault,
      openExternal,
    });

    expect(preventDefault).toHaveBeenCalledOnce();
    await Promise.resolve();
    expect(openExternal).toHaveBeenCalledWith('http://10.126.126.1:32100');
  });

  it('rejects unsupported navigation schemes and new Electron windows', async () => {
    const openExternal = vi.fn(async () => undefined);
    const preventDefault = vi.fn();

    guardMainWindowNavigation({
      url: 'javascript:alert(1)',
      isTrustedRendererUrl: () => false,
      preventDefault,
      openExternal,
    });

    expect(preventDefault).toHaveBeenCalledOnce();
    expect(openExternal).not.toHaveBeenCalled();
    expect(
      guardNewWindowOpen('https://example.test/invite', openExternal),
    ).toEqual({ action: 'deny' });
    await Promise.resolve();
    expect(openExternal).toHaveBeenCalledWith('https://example.test/invite');
  });
});
