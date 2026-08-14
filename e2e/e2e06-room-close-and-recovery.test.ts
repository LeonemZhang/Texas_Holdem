import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { CreateRoomRecordRequest } from '@texas-holdem/protocol';

import {
  recoverRoomRecordFromHost,
  type RoomRecordRecoveryHostController,
} from '../apps/desktop/src/main/room-record-recovery.js';
import type {
  DesktopNetworkInterface,
  HostServiceInfo,
} from '../apps/desktop/src/shared/runtime.js';
import { GameRuntime } from '../apps/host/src/application/game-runtime.js';
import { RoomRecordManagementService } from '../apps/host/src/application/room-record-management.js';
import { recoverRoom } from '../apps/host/src/application/room-recovery.js';
import { closeRoom } from '../apps/host/src/domain/room-control.js';
import { createRoom, freezeRoom } from '../apps/host/src/domain/room.js';
import { HOST_MIGRATIONS } from '../apps/host/src/persistence/migrations.js';
import {
  openSqliteDatabase,
  runSqliteMigrations,
} from '../apps/host/src/persistence/sqlite-database.js';
import { SqliteEventStore } from '../apps/host/src/persistence/sqlite-event-command-store.js';
import { SqliteRoomLifecycleStore } from '../apps/host/src/persistence/sqlite-room-lifecycle-store.js';
import { SqliteRoomRecoveryCatalog } from '../apps/host/src/persistence/sqlite-room-recovery-catalog.js';
import { SqliteRoomRecordCatalog } from '../apps/host/src/persistence/sqlite-room-record-catalog.js';
import { SqliteSnapshotStore } from '../apps/host/src/persistence/sqlite-snapshot-store.js';
import { SqliteGameRuntimeStore } from '../apps/host/src/persistence/sqlite-game-runtime-store.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function databasePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'texas-holdem-e2e06-'));
  temporaryDirectories.push(directory);
  return join(directory, 'room.sqlite');
}

function playingRoom() {
  return freezeRoom({
    ...createRoom({
      roomId: 'room-1',
      hostPlayerId: 'host',
      hostNickname: 'Alice',
      settings: {
        roomName: 'Friends',
        maxPlayers: 10,
        initialChips: 100,
        blind: { kind: 'preset', smallBlind: 1 },
        actionTimeoutSeconds: 30,
        handReadyTimeoutSeconds: 30,
        blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
        zeroChipPolicy: 'request-chips',
      },
    }),
    phase: 'playing' as const,
    firstHandStarted: true,
    version: 1,
  });
}

function saveSnapshot(path: string) {
  const database = openSqliteDatabase(path);
  runSqliteMigrations(database, HOST_MIGRATIONS);
  const room = playingRoom();
  new SqliteRoomLifecycleStore(database).saveActive(room, 1);
  new SqliteSnapshotStore(database).save({
    roomId: room.roomId,
    sequence: 1,
    stateVersion: room.version,
    createdAtMs: 1,
    state: {
      room,
      hand: null,
      handReady: null,
      chipRequests: null,
      chipActivity: [],
    },
  });
  return { database, room };
}

function recover(path: string) {
  const database = openSqliteDatabase(path);
  runSqliteMigrations(database, HOST_MIGRATIONS);
  const state = recoverRoom(
    'room-1',
    new SqliteRoomRecoveryCatalog(database),
    new SqliteSnapshotStore(database),
    new SqliteEventStore(database),
  );
  return { database, state };
}

const recoveryNetwork: DesktopNetworkInterface = {
  name: 'Home LAN',
  address: '127.0.0.1',
  netmask: '255.0.0.0',
  mac: '00:11:22:33:44:55',
};

const recoveryService: HostServiceInfo = {
  port: 32_100,
  advertisedAddress: recoveryNetwork.address,
  joinUrl: 'http://127.0.0.1:32100',
  dataDirectory: 'temporary-room-data',
  networkName: recoveryNetwork.name,
};

function createRecordRequest(): CreateRoomRecordRequest {
  return {
    protocolVersion: '3',
    requestId: 'lifecycle-create',
    type: 'room-record.create',
    hostNickname: 'Alice',
    settings: {
      roomName: 'Lifecycle evidence',
      maxPlayers: 4,
      initialChips: 100,
      smallBlind: 1,
      actionTimeoutSeconds: 30,
      handReadyTimeoutSeconds: 30,
      blindGrowth: { enabled: false, intervalHands: 10, multiplier: 2 },
      zeroChipPolicy: 'request-chips',
    },
  };
}

function createRuntimeNode(path: string) {
  const database = openSqliteDatabase(path);
  runSqliteMigrations(database, HOST_MIGRATIONS);
  const store = new SqliteGameRuntimeStore(database, {
    name: recoveryNetwork.name,
    address: recoveryNetwork.address,
  });
  const runtime = new GameRuntime({
    sessionFallback: (credentials) => store.authenticate(credentials),
  });
  let updatedAtMs = 1;
  const stopPersistence = runtime.onStateCommitted((roomId) => {
    const state = runtime.exportState(roomId);
    if (state) store.save(state, updatedAtMs++);
  });
  const records = new RoomRecordManagementService(
    runtime,
    new SqliteRoomRecordCatalog(database),
    store,
  );
  return {
    database,
    records,
    runtime,
    close() {
      stopPersistence();
      runtime.dispose();
      database.close();
    },
  };
}

function controllerFor(
  records: RoomRecordManagementService,
): RoomRecordRecoveryHostController {
  let activeService: HostServiceInfo | null = null;
  return {
    current: () => activeService,
    async manage(request) {
      if (request.type === 'room-record.get') {
        return { record: records.getRecord(String(request.roomId)) };
      }
      if (request.type === 'room-record.recover') {
        return {
          session: records.recoverRecord(
            String(request.roomId),
            recoveryService.joinUrl,
          ),
        };
      }
      throw new Error(
        `Unsupported lifecycle management request: ${String(request.type)}`,
      );
    },
    async start() {
      activeService = recoveryService;
      return recoveryService;
    },
    async stop() {
      activeService = null;
    },
  };
}

describe('E2E06 host close and same-machine recovery', () => {
  it('keeps one record distinguishable across Host interruption, desktop recovery, close, and archive', async () => {
    const path = await databasePath();
    const original = createRuntimeNode(path);
    const created = original.records.createRecord(
      createRecordRequest(),
      recoveryService.joinUrl,
    );
    expect(original.records.listRecords(false)).toMatchObject([
      { roomId: created.roomId, status: 'running' },
    ]);

    // The Host control socket is allowed to disappear without changing the
    // persisted running-room state; process interruption is represented by
    // disposing the runtime without a normal room.close command.
    original.close();

    const restarted = createRuntimeNode(path);
    try {
      expect(restarted.records.getRecord(created.roomId)).toMatchObject({
        roomId: created.roomId,
        status: 'recoverable',
      });

      const recovered = await recoverRoomRecordFromHost({
        controller: controllerFor(restarted.records),
        input: { roomId: created.roomId },
        networkInterfaces: () => [recoveryNetwork],
        createRequestId: (() => {
          let requestNumber = 0;
          return () => `lifecycle-recovery-${++requestNumber}`;
        })(),
      });
      expect(recovered).toMatchObject({
        roomId: created.roomId,
        socketPath: '/socket.io',
      });
      expect(restarted.records.listRecords(false)).toMatchObject([
        { roomId: created.roomId, status: 'running' },
      ]);

      expect(restarted.records.closeRunningRecord(created.roomId)).toBe(
        created.roomId,
      );
      restarted.runtime.retireClosedRoom(created.roomId);
      expect(restarted.records.getRecord(created.roomId)).toMatchObject({
        roomId: created.roomId,
        status: 'closed',
      });

      restarted.records.archiveRecord(created.roomId);
      expect(restarted.records.listRecords(false)).toEqual([]);
      expect(restarted.records.listRecords(true)).toMatchObject([
        { roomId: created.roomId, status: 'archived' },
      ]);
    } finally {
      restarted.close();
    }
  });

  it('recovers an active room after the host process exits abnormally', async () => {
    const path = await databasePath();
    const current = saveSnapshot(path);
    current.database.close();

    const restarted = recover(path);
    try {
      expect(restarted.state?.room).toMatchObject({
        roomId: 'room-1',
        phase: 'playing',
        version: 1,
      });
      expect(
        restarted.database
          .prepare('SELECT phase, normal_closed FROM rooms WHERE room_id = ?')
          .get('room-1'),
      ).toMatchObject({ phase: 'playing', normal_closed: 0 });
    } finally {
      restarted.database.close();
    }
  });

  it('persists an explicit host close and refuses to recover it as active', async () => {
    const path = await databasePath();
    const current = saveSnapshot(path);
    const closed = closeRoom(current.room, 'host');
    expect(closed.event.normal).toBe(true);
    new SqliteRoomLifecycleStore(current.database).markNormallyClosed(
      closed.room,
      2,
    );
    current.database.close();

    const restarted = recover(path);
    try {
      expect(restarted.state).toBeNull();
      expect(
        restarted.database
          .prepare('SELECT phase, normal_closed FROM rooms WHERE room_id = ?')
          .get('room-1'),
      ).toMatchObject({ phase: 'closed', normal_closed: 1 });
    } finally {
      restarted.database.close();
    }
  });
});
