import { describe, expect, it, vi } from 'vitest';

import type {
  DesktopNetworkInterface,
  HostServiceInfo,
} from '../shared/runtime.js';

import {
  recoverRoomRecordFromHost,
  type RoomRecordRecoveryHostController,
} from './room-record-recovery.js';

const network: DesktopNetworkInterface = {
  name: 'Home LAN',
  address: '192.168.1.8',
  netmask: '255.255.255.0',
  mac: '00:11:22:33:44:55',
};

const service: HostServiceInfo = {
  port: 32_100,
  advertisedAddress: network.address,
  joinUrl: 'http://192.168.1.8:32100',
  dataDirectory: 'rooms',
  networkName: network.name,
};

const session = {
  protocolVersion: '3' as const,
  roomId: 'room-1',
  playerId: 'host',
  token: 'host-recovery-token-123456',
  joinUrl: 'http://192.168.1.8:32100/?room=room-1',
  socketPath: '/socket.io' as const,
};

function controller(
  record: unknown,
  recoveredSession: unknown = session,
): RoomRecordRecoveryHostController & {
  readonly manage: ReturnType<typeof vi.fn>;
  readonly start: ReturnType<typeof vi.fn>;
  readonly stop: ReturnType<typeof vi.fn>;
} {
  return {
    current: vi.fn(() => null),
    manage: vi
      .fn()
      .mockResolvedValueOnce({ record })
      .mockResolvedValueOnce({ session: recoveredSession }),
    start: vi.fn(async () => service),
    stop: vi.fn(async () => undefined),
  };
}

describe('recoverRoomRecordFromHost', () => {
  it('reuses a saved local IPv4 without asking the renderer to resubmit it', async () => {
    const host = controller({
      network: { name: network.name, address: network.address },
    });

    await expect(
      recoverRoomRecordFromHost({
        controller: host,
        input: { roomId: 'room-1' },
        networkInterfaces: () => [network],
        createRequestId: vi.fn(() => 'request-id'),
      }),
    ).resolves.toEqual(session);

    expect(host.start).toHaveBeenCalledWith({
      port: 32_100,
      advertisedAddress: network.address,
      networkName: network.name,
    });
    expect(host.manage).toHaveBeenLastCalledWith({
      protocolVersion: '3',
      requestId: 'request-id',
      type: 'room-record.recover',
      roomId: 'room-1',
    });
  });

  it('preserves the independent Host session metadata for service-only rooms', async () => {
    const recoveredSession = {
      ...session,
      sessionType: 'host' as const,
      hostId: 'host',
    };
    const host = controller(
      { network: { name: network.name, address: network.address } },
      recoveredSession,
    );

    await expect(
      recoverRoomRecordFromHost({
        controller: host,
        input: { roomId: 'room-1' },
        networkInterfaces: () => [network],
        createRequestId: vi.fn(() => 'request-id'),
      }),
    ).resolves.toEqual(recoveredSession);
  });

  it('recovers a legacy record with the one-time network selected by the renderer', async () => {
    const host = controller({ network: null });

    await expect(
      recoverRoomRecordFromHost({
        controller: host,
        input: {
          roomId: 'room-1',
          network: { name: network.name, address: network.address },
        },
        networkInterfaces: () => [network],
        createRequestId: vi.fn(() => 'request-id'),
      }),
    ).resolves.toEqual(session);

    expect(host.start).toHaveBeenCalledOnce();
    expect(host.stop).not.toHaveBeenCalled();
  });

  it('stops a newly started host when record restoration is rejected', async () => {
    const host = controller({
      network: { name: network.name, address: network.address },
    });
    host.manage.mockReset();
    host.manage
      .mockResolvedValueOnce({ record: { network } })
      .mockRejectedValueOnce(new Error('Room record is not recoverable'));

    await expect(
      recoverRoomRecordFromHost({
        controller: host,
        input: { roomId: 'room-1' },
        networkInterfaces: () => [network],
        createRequestId: vi.fn(() => 'request-id'),
      }),
    ).rejects.toThrow('Room record is not recoverable');

    expect(host.stop).toHaveBeenCalledOnce();
  });
});
