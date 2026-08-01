import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

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
import { SqliteSnapshotStore } from '../apps/host/src/persistence/sqlite-snapshot-store.js';

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
    state: { room, hand: null, handReady: null, chipRequests: null },
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

describe('E2E06 host close and same-machine recovery', () => {
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
