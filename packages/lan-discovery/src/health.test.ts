import { describe, expect, it } from 'vitest';

import { PROTOCOL_VERSION } from '@texas-holdem/protocol';

import {
  parseManualJoinAddress,
  validateRoomHealth,
  type HealthFetcher,
} from './health.js';

const health = {
  status: 'ok' as const,
  protocolVersion: PROTOCOL_VERSION,
  serverVersion: '0.0.0',
  connection: {
    host: '10.126.126.1',
    port: 32100,
    joinUrl: 'http://10.126.126.1:32100',
    socketPath: '/socket.io',
  },
};

describe('manual join address and health validation', () => {
  it.each([
    ['10.126.126.1', 'http://10.126.126.1:32100/'],
    ['10.126.126.1:45678', 'http://10.126.126.1:45678/'],
    ['https://10.126.126.1:4443/join', 'https://10.126.126.1:4443/join'],
  ])('parses %s as %s', (input, expected) => {
    expect(parseManualJoinAddress(input).toString()).toBe(expected);
  });

  it('rejects invalid hosts and non-HTTP schemes', () => {
    expect(() => parseManualJoinAddress('')).toThrow('请输入房主 IP 地址');
    expect(() => parseManualJoinAddress('not an ip')).toThrow(
      '房主地址不是有效的 IP 或 URL',
    );
    expect(() => parseManualJoinAddress('ftp://10.126.126.1')).toThrow(
      '房间地址仅支持 HTTP 或 HTTPS',
    );
  });

  it('marks a valid versioned health response reachable', async () => {
    const fetcher: HealthFetcher = async (url) => {
      expect(url).toBe('http://10.126.126.1:32100/health');
      return { ok: true, status: 200, json: async () => health };
    };
    await expect(
      validateRoomHealth('10.126.126.1', { fetcher }),
    ).resolves.toMatchObject({ status: 'reachable', health });
  });

  it('distinguishes unreachable and incompatible rooms', async () => {
    await expect(
      validateRoomHealth('10.126.126.1', {
        fetcher: async () => {
          throw new Error('connection refused');
        },
      }),
    ).resolves.toMatchObject({
      status: 'unreachable',
      error: 'connection refused',
    });
    await expect(
      validateRoomHealth('10.126.126.1', {
        fetcher: async () => ({
          ok: true,
          status: 200,
          json: async () => ({ status: 'ok', protocolVersion: '999' }),
        }),
      }),
    ).resolves.toMatchObject({ status: 'incompatible' });
  });
});
