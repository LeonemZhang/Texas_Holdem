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
import { UdpDiscoveryResponder } from './responder.js';

const scanners: LanRoomScanner[] = [];
const responders: UdpDiscoveryResponder[] = [];

afterEach(async () => {
  await Promise.all([
    ...scanners.splice(0).map((scanner) => scanner.close()),
    ...responders.splice(0).map((responder) => responder.close()),
  ]);
});

const room = {
  magic: DISCOVERY_MAGIC,
  protocolVersion: PROTOCOL_VERSION,
  requestId: 'scan-1',
  type: 'room' as const,
  roomId: 'room-1',
  roomName: 'Friends',
  hostNickname: 'Alice',
  hostAddress: '10.126.126.1',
  httpPort: 32100,
  playerCount: 2,
  maxPlayers: 10,
  smallBlind: 1,
  bigBlind: 2,
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

  it('uses the discovery response source address for a reachable multi-NIC host', () => {
    const results = new DiscoveryResultSet(1_000);
    expect(results.accept(room, 'scan-1', 100, '192.168.20.10')).toBe(true);
    expect(results.list(100)).toEqual([
      expect.objectContaining({
        roomId: 'room-1',
        hostAddress: '192.168.20.10',
      }),
    ]);
  });

  it('discovers the host interface that answered the local network request', async () => {
    const responder = new UdpDiscoveryResponder({
      bindAddress: '127.0.0.2',
      discoveryPort: 0,
      advertisedAddress: '10.126.126.1',
      httpPort: 32_100,
      roomSummary: () => ({
        roomId: room.roomId,
        roomName: room.roomName,
        hostNickname: room.hostNickname,
        playerCount: room.playerCount,
        maxPlayers: room.maxPlayers,
        smallBlind: room.smallBlind,
        bigBlind: room.bigBlind,
        phase: room.phase,
      }),
    });
    responders.push(responder);
    const bound = await responder.start();
    const scanner = new LanRoomScanner({
      discoveryPort: bound.port,
      scanWindowMs: 20,
      interfaces: () => ({
        TestAdapter: [ipv4('127.0.0.2', '255.255.255.255')],
      }),
    });
    scanners.push(scanner);

    await expect(scanner.scan('scan-1')).resolves.toEqual([
      expect.objectContaining({
        roomId: room.roomId,
        hostAddress: '127.0.0.2',
      }),
    ]);
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
