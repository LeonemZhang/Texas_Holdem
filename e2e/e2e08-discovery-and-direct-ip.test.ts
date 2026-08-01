import { describe, expect, it } from 'vitest';

import { PROTOCOL_VERSION } from '../packages/protocol/src/index.js';
import {
  parseManualJoinAddress,
  validateRoomHealth,
} from '../packages/lan-discovery/src/health.js';
import {
  LanDiscoveryUnavailableError,
  LanRoomScanner,
} from '../packages/lan-discovery/src/scanner.js';

describe('E2E08 discovery failure and direct IP fallback', () => {
  it('keeps manual IP health checks available when UDP discovery cannot start', async () => {
    const scanner = new LanRoomScanner({
      discoveryPort: 32_101,
      interfaces: () => ({
        Loopback: [
          {
            address: '127.0.0.1',
            netmask: '255.0.0.0',
            family: 'IPv4',
            mac: '00:00:00:00:00:00',
            internal: true,
            cidr: '127.0.0.1/8',
          },
        ],
      }),
    });
    await expect(scanner.scan('scan-1')).rejects.toBeInstanceOf(
      LanDiscoveryUnavailableError,
    );

    const direct = parseManualJoinAddress('10.126.126.1');
    expect(direct.toString()).toBe('http://10.126.126.1:32100/');
    await expect(
      validateRoomHealth(direct, {
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
  });

  it('reports incompatible protocol and unreachable port as distinct failures', async () => {
    await expect(
      validateRoomHealth('10.126.126.1', {
        fetcher: async () => ({
          ok: true,
          status: 200,
          json: async () => ({ protocolVersion: '999' }),
        }),
      }),
    ).resolves.toMatchObject({
      status: 'incompatible',
      error: 'Health response uses an incompatible protocol',
    });

    await expect(
      validateRoomHealth('10.126.126.1', {
        fetcher: async () => {
          throw new Error('connect ECONNREFUSED 10.126.126.1:32100');
        },
      }),
    ).resolves.toMatchObject({
      status: 'unreachable',
      error: 'connect ECONNREFUSED 10.126.126.1:32100',
    });
  });
});
