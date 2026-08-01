import { afterEach, describe, expect, it } from 'vitest';
import { getRuntimeAdapter } from './runtime';

afterEach(() => {
  delete window.texasHoldemDesktop;
});

describe('runtime adapter', () => {
  it('uses the browser adapter when no desktop bridge exists', async () => {
    await expect(getRuntimeAdapter().getRuntimeInfo()).resolves.toMatchObject({
      kind: 'browser',
      appVersion: 'web',
    });
  });

  it('uses the narrow desktop bridge when available', async () => {
    window.texasHoldemDesktop = {
      async getRuntimeInfo() {
        return { kind: 'desktop', appVersion: '0.0.0', platform: 'win32' };
      },
      listNetworkInterfaces: async () => [],
      scanLanRooms: async () => [],
      startHostService: async () => ({
        port: 32_100,
        advertisedAddress: '127.0.0.1',
        joinUrl: 'http://127.0.0.1:32100',
        dataDirectory: 'rooms',
      }),
      stopHostService: async () => undefined,
      onHostServiceExited: () => () => undefined,
      setWindowRoomContext: async () => undefined,
      onPlayerExitRequested: () => () => undefined,
      onHostCloseRequested: () => () => undefined,
    };

    await expect(getRuntimeAdapter().getRuntimeInfo()).resolves.toEqual({
      kind: 'desktop',
      appVersion: '0.0.0',
      platform: 'win32',
    });
  });
});
