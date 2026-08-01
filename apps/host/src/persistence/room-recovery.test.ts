import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { PROTOCOL_VERSION, type DomainEvent } from '@texas-holdem/protocol';

import {
  recoverRoom,
  replayRecoveryEvent,
} from '../application/room-recovery.js';
import { createRoom, freezeRoom } from '../domain/room.js';
import { HOST_MIGRATIONS } from './migrations.js';
import { openSqliteDatabase, runSqliteMigrations } from './sqlite-database.js';
import { SqliteEventStore } from './sqlite-event-command-store.js';
import { SqliteRoomRecoveryCatalog } from './sqlite-room-recovery-catalog.js';
import { SqliteSnapshotStore } from './sqlite-snapshot-store.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function context() {
  const directory = await mkdtemp(join(tmpdir(), 'texas-holdem-recovery-'));
  temporaryDirectories.push(directory);
  const database = openSqliteDatabase(join(directory, 'room.sqlite'));
  runSqliteMigrations(database, HOST_MIGRATIONS);
  const room = freezeRoom({
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
    phase: 'playing',
    firstHandStarted: true,
    version: 1,
  });
  database
    .prepare(
      `
      INSERT INTO rooms (
        room_id, host_player_id, phase, state_version, settings_json,
        created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run('room-1', 'host', 'playing', 1, JSON.stringify(room.settings), 1, 1);
  const snapshots = new SqliteSnapshotStore(database);
  snapshots.save({
    roomId: 'room-1',
    sequence: 1,
    stateVersion: 1,
    createdAtMs: 1,
    state: { room, hand: null, handReady: null, chipRequests: null },
  });
  return {
    database,
    room,
    snapshots,
    events: new SqliteEventStore(database, () => 2),
    catalog: new SqliteRoomRecoveryCatalog(database),
  };
}

const paused: DomainEvent = {
  protocolVersion: PROTOCOL_VERSION,
  eventId: 'event-2',
  roomId: 'room-1',
  sequence: 2,
  stateVersion: 2,
  type: 'room.control-changed',
  phase: 'paused',
};

describe('room recovery from snapshot and events', () => {
  it('matches the uninterrupted state after replaying continuous events', async () => {
    const current = await context();
    try {
      current.events.append([paused]);
      const expected = replayRecoveryEvent(
        {
          room: current.room,
          hand: null,
          handReady: null,
          chipRequests: null,
        },
        paused,
      );
      expect(
        recoverRoom(
          'room-1',
          current.catalog,
          current.snapshots,
          current.events,
        ),
      ).toEqual(expected);
    } finally {
      current.database.close();
    }
  });

  it('does not recover a normally closed room as active', async () => {
    const current = await context();
    try {
      current.database
        .prepare(
          "UPDATE rooms SET phase = 'closed', normal_closed = 1 WHERE room_id = ?",
        )
        .run('room-1');
      expect(
        recoverRoom(
          'room-1',
          current.catalog,
          current.snapshots,
          current.events,
        ),
      ).toBeNull();
    } finally {
      current.database.close();
    }
  });

  it('fails clearly when event replay has a sequence gap', async () => {
    const current = await context();
    try {
      current.events.append([{ ...paused, sequence: 3 }]);
      expect(() =>
        recoverRoom(
          'room-1',
          current.catalog,
          current.snapshots,
          current.events,
        ),
      ).toThrowError(expect.objectContaining({ code: 'EVENT_SEQUENCE_GAP' }));
    } finally {
      current.database.close();
    }
  });
});
