import { describe, expect, it } from 'vitest';

import { PROTOCOL_VERSION } from '@texas-holdem/protocol';

import { validateRoomHealth } from './health.js';
import { LanRoomScanner } from './scanner.js';

describe('LAN discovery phase gate', () => {
  it('keeps manual IP connection available when broadcast scanning is unsupported', async () => {
    const scanner = new LanRoomScanner({
      discoveryPort: 32_101,
      interfaces: () => ({}),
    });
    await expect(scanner.scan('scan-1')).rejects.toMatchObject({
      name: 'LanDiscoveryUnavailableError',
      code: 'LAN_DISCOVERY_UNAVAILABLE',
    });
    await expect(
      validateRoomHealth('10.126.126.1', {
        fetcher: async () => ({
          ok: true,
          status: 200,
          json: async () => ({
            status: 'ok',
            protocolVersion: PROTOCOL_VERSION,
            serverVersion: '0.0.0',
            connection: {
              host: '10.126.126.1',
              port: 32_100,
              joinUrl: 'http://10.126.126.1:32100',
              socketPath: '/socket.io',
            },
          }),
        }),
      }),
    ).resolves.toMatchObject({ status: 'reachable' });
    await scanner.close();
  });
});
