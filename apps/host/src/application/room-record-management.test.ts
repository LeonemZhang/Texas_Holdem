import { describe, expect, it, vi } from 'vitest';

import type {
  CreateRoomRecordRequest,
  RoomRecordSummary,
  RoomSessionResponse,
} from '@texas-holdem/protocol';

import {
  RoomRecordManagementService,
  type RoomRecordCatalogPort,
  type RoomRecordRuntimePort,
} from './room-record-management.js';
import { createRoom } from '../domain/room.js';
import type { RoomRecoveryState } from './persistence-ports.js';

const recoverable: RoomRecordSummary = {
  roomId: 'recoverable-room',
  roomName: 'Friday poker',
  hostNickname: 'Alice',
  status: 'recoverable',
  createdAt: '2026-08-02T01:00:00.000Z',
  lastActiveAt: '2026-08-02T02:00:00.000Z',
  completedHands: 2,
  playerCount: 2,
  network: null,
};
const archived: RoomRecordSummary = {
  ...recoverable,
  roomId: 'archived-room',
  status: 'archived',
};

const recoveredState: RoomRecoveryState = {
  room: createRoom({
    roomId: recoverable.roomId,
    hostPlayerId: 'host',
    hostNickname: 'Alice',
    settings: {
      roomName: recoverable.roomName,
      maxPlayers: 10,
      initialChips: 2_000,
      blind: { kind: 'preset', smallBlind: 1 },
      actionTimeoutSeconds: 30,
      handReadyTimeoutSeconds: 30,
      blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
      zeroChipPolicy: 'request-chips',
    },
  }),
  hand: null,
  handReady: null,
  chipRequests: null,
  chipActivity: [],
};

function request(): CreateRoomRecordRequest {
  return {
    protocolVersion: '3',
    requestId: 'request-1',
    type: 'room-record.create',
    hostNickname: 'Alice',
    settings: {
      roomName: 'New game',
      maxPlayers: 10,
      initialChips: 2_000,
      smallBlind: 1,
      actionTimeoutSeconds: 30,
      handReadyTimeoutSeconds: 30,
      blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
      zeroChipPolicy: 'request-chips',
    },
  };
}

function context(activeRoomId: string | null = null) {
  const roomSession: RoomSessionResponse = {
    protocolVersion: '3',
    roomId: 'new-room',
    playerId: 'host',
    token: 'host-token',
    joinUrl: 'http://127.0.0.1:32100/?room=new-room',
    socketPath: '/socket.io',
  };
  const runtime: RoomRecordRuntimePort = {
    currentRoomId: vi.fn(() => activeRoomId),
    create: vi.fn(() => roomSession),
    restore: vi.fn(),
    createRecoveredHostSession: vi.fn(() => roomSession),
    closeRunningRoom: vi.fn(() => activeRoomId ?? 'running-room'),
  };
  const catalog: RoomRecordCatalogPort = {
    list: vi.fn(() => [recoverable, archived]),
    setArchived: vi.fn(),
    delete: vi.fn(),
  };
  const loader = {
    loadRecoverable: vi.fn(() => ({ state: recoveredState, sequence: 4 })),
  };
  return {
    runtime,
    catalog,
    loader,
    service: new RoomRecordManagementService(runtime, catalog, loader),
  };
}

describe('RoomRecordManagementService', () => {
  it('lists a currently loaded record as running without persisting that state', () => {
    const { service } = context(recoverable.roomId);

    expect(service.listRecords(true)).toEqual([
      expect.objectContaining({
        roomId: recoverable.roomId,
        status: 'running',
      }),
      archived,
    ]);
  });

  it('creates a room only while no record is running', () => {
    const { service, runtime } = context();

    expect(
      service.createRecord(request(), 'http://127.0.0.1:32100'),
    ).toMatchObject({
      roomId: 'new-room',
    });
    expect(runtime.create).toHaveBeenCalledWith(
      request(),
      'http://127.0.0.1:32100',
    );
    expect(() =>
      context('running-room').service.createRecord(request(), 'http://host'),
    ).toThrow('already running');
  });

  it('loads only an explicitly selected recoverable record', () => {
    const { service, runtime, loader } = context();

    expect(
      service.recoverRecord(recoverable.roomId, 'http://127.0.0.1:32100'),
    ).toMatchObject({ roomId: 'new-room', playerId: 'host' });
    expect(loader.loadRecoverable).toHaveBeenCalledWith(recoverable.roomId);
    expect(runtime.restore).toHaveBeenCalledWith(recoveredState, 4);
    expect(runtime.createRecoveredHostSession).toHaveBeenCalledWith(
      'http://127.0.0.1:32100',
    );
    expect(() =>
      service.recoverRecord(archived.roomId, 'http://127.0.0.1:32100'),
    ).toThrow('interrupted');
  });

  it('returns to a running record and closes it only when that record is selected', () => {
    const { service, runtime } = context(recoverable.roomId);

    expect(
      service.recoverRecord(recoverable.roomId, 'http://127.0.0.1:32100'),
    ).toMatchObject({ roomId: 'new-room' });
    expect(runtime.createRecoveredHostSession).toHaveBeenCalledWith(
      'http://127.0.0.1:32100',
    );
    expect(service.closeRunningRecord(recoverable.roomId)).toBe(
      recoverable.roomId,
    );
    expect(runtime.closeRunningRoom).toHaveBeenCalledOnce();
    expect(() => service.closeRunningRecord(archived.roomId)).toThrow(
      'not running locally',
    );
  });

  it('archives only non-running records and restores archived records reversibly', () => {
    const { service, catalog } = context();

    service.archiveRecord(recoverable.roomId);
    service.restoreArchivedRecord(archived.roomId);

    expect(catalog.setArchived).toHaveBeenNthCalledWith(
      1,
      recoverable.roomId,
      true,
    );
    expect(catalog.setArchived).toHaveBeenNthCalledWith(
      2,
      archived.roomId,
      false,
    );
    expect(() =>
      context(recoverable.roomId).service.archiveRecord(recoverable.roomId),
    ).toThrow('cannot be archived');
  });

  it('deletes only archived records', () => {
    const { service, catalog } = context();

    service.deleteArchivedRecord(archived.roomId);

    expect(catalog.delete).toHaveBeenCalledWith(archived.roomId);
    expect(() => service.deleteArchivedRecord(recoverable.roomId)).toThrow(
      'Only an archived room can be deleted',
    );
    expect(() =>
      context(recoverable.roomId).service.deleteArchivedRecord(
        recoverable.roomId,
      ),
    ).toThrow('Only an archived room can be deleted');
  });
});
