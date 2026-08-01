import type { NetworkInterfaceInfo } from 'node:os';

import { afterEach, describe, expect, it } from 'vitest';

import { PROTOCOL_VERSION } from '@texas-holdem/protocol';

import { DISCOVERY_MAGIC } from './messages.js';
import {
  DiscoveryResultSet,
  LanRoomScanner,
  ipv4BroadcastAddress,
  listIpv4BroadcastTargets,
} from './scanner.js';

const scanners: LanRoomScanner[] = [];

afterEach(async () => {
  await Promise.all(scanners.splice(0).map((scanner) => scanner.close()));
});

const room = {
  magic: DISCOVERY_MAGIC,
  protocolVersion: PROTOCOL_VERSION,
  requestId: 'scan-1',
  type: 'room' as const,
  roomId: 'room-1',
  roomName: 'Friends',
  hostAddress: '10.126.126.1',
  httpPort: 32100,
  playerCount: 2,
  maxPlayers: 10,
  phase: 'lobby' as const,
};

function ipv4(
  address: string,
  netmask: string,
  internal = false,
): NetworkInterfaceInfo {
  return {
    address,
    netmask,
    family: 'IPv4',
    mac: '00:00:00:00:00:00',
    internal,
    cidr: null,
  };
}

describe('LAN room scanner', () => {
  it('calculates broadcast targets for physical and virtual IPv4 adapters', () => {
    expect(ipv4BroadcastAddress('10.126.126.2', '255.255.255.0')).toBe(
      '10.126.126.255',
    );
    expect(
      listIpv4BroadcastTargets({
        VirtualNet: [ipv4('10.126.126.2', '255.255.255.0')],
        Ethernet: [ipv4('192.168.1.20', '255.255.255.0')],
        Loopback: [ipv4('127.0.0.1', '255.0.0.0', true)],
      }),
    ).toEqual(['10.126.126.255', '192.168.1.255']);
  });

  it('deduplicates by room id and removes stale responses', () => {
    const results = new DiscoveryResultSet(1_000);
    expect(results.accept(room, 'scan-1', 100)).toBe(true);
    expect(
      results.accept(
        { ...room, hostAddress: '10.126.126.9', playerCount: 3 },
        'scan-1',
        200,
      ),
    ).toBe(true);
    expect(results.list(500)).toEqual([
      expect.objectContaining({
        roomId: 'room-1',
        hostAddress: '10.126.126.9',
        playerCount: 3,
      }),
    ]);
    expect(results.list(1_201)).toEqual([]);
  });

  it('opens, scans and closes its UDP resource cleanly', async () => {
    const scanner = new LanRoomScanner({
      discoveryPort: 9,
      scanWindowMs: 1,
      interfaces: () => ({
        TestAdapter: [ipv4('127.0.0.1', '255.255.255.255')],
      }),
    });
    scanners.push(scanner);
    await expect(scanner.scan('scan-1')).resolves.toEqual([]);
    await scanner.close();
    await expect(scanner.close()).resolves.toBeUndefined();
  });
});
