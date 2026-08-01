import type { NetworkInterfaceInfo } from 'node:os';
import { describe, expect, it } from 'vitest';

import { DiscoveryScanInputSchema } from '../shared/runtime';
import { listDesktopNetworkInterfaces } from './network-services';

function address(value: string, internal = false): NetworkInterfaceInfo {
  return {
    address: value,
    netmask: '255.255.255.0',
    family: 'IPv4',
    mac: '00:11:22:33:44:55',
    internal,
    cidr: `${value}/24`,
  };
}

describe('desktop network services', () => {
  it('lists physical and virtual non-internal IPv4 interfaces', () => {
    const result = listDesktopNetworkInterfaces({
      Ethernet: [address('192.168.1.8')],
      'Virtual LAN': [address('10.126.126.1')],
      Loopback: [address('127.0.0.1', true)],
    });
    expect(result).toEqual([
      expect.objectContaining({ name: 'Ethernet', address: '192.168.1.8' }),
      expect.objectContaining({
        name: 'Virtual LAN',
        address: '10.126.126.1',
      }),
    ]);
  });

  it('rejects malformed scan parameters before IPC reaches UDP', () => {
    expect(
      DiscoveryScanInputSchema.safeParse({
        requestId: '',
        discoveryPort: 70_000,
      }).success,
    ).toBe(false);
    expect(
      DiscoveryScanInputSchema.parse({
        requestId: 'scan-1',
        discoveryPort: 32_101,
      }),
    ).toEqual({ requestId: 'scan-1', discoveryPort: 32_101 });
  });
});
