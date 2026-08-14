import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createRoom } from '../domain/room.js';
import type {
  RoomRecoveryState,
  StoredRoomSnapshot,
} from '../application/persistence-ports.js';
import { HOST_MIGRATIONS } from './migrations.js';
import { openSqliteDatabase, runSqliteMigrations } from './sqlite-database.js';
import {
  SnapshotRecoveryError,
  SqliteSnapshotStore,
} from './sqlite-snapshot-store.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function context(threshold = 64 * 1024) {
  const directory = await mkdtemp(join(tmpdir(), 'texas-holdem-snapshot-'));
  temporaryDirectories.push(directory);
  const database = openSqliteDatabase(join(directory, 'room.sqlite'));
  runSqliteMigrations(database, HOST_MIGRATIONS);
  database
    .prepare(
      `
      INSERT INTO rooms (
        room_id, host_player_id, phase, state_version, settings_json,
        created_at_ms, updated_at_ms
      ) VALUES ('room-1', 'host', 'lobby', 0, '{}', 1, 1)
    `,
    )
    .run();
  return { database, store: new SqliteSnapshotStore(database, threshold) };
}

function snapshot(sequence = 0): StoredRoomSnapshot {
  const room = createRoom({
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
  });
  return {
    roomId: room.roomId,
    sequence,
    stateVersion: room.version,
    createdAtMs: sequence + 1,
    state: {
      room,
      hand: null,
      handReady: null,
      chipRequests: null,
      chipActivity: [],
    },
  };
}

describe('SqliteSnapshotStore', () => {
  it('saves and restores an immutable room recovery snapshot', async () => {
    const current = await context();
    try {
      current.store.save(snapshot());
      const restored = current.store.latest('room-1');
      expect(restored).toEqual(snapshot());
      expect(Object.isFrozen(restored?.state.room.players)).toBe(true);
    } finally {
      current.database.close();
    }
  });

  it('uses gzip above the configured strategy threshold and reads the latest valid row', async () => {
    const current = await context(1);
    try {
      current.store.save(snapshot(1));
      current.store.save(snapshot(2));
      expect(
        current.database
          .prepare('SELECT encoding FROM snapshots WHERE sequence = 2')
          .get(),
      ).toMatchObject({ encoding: 'gzip-json' });
      current.database
        .prepare('UPDATE snapshots SET valid = 0 WHERE sequence = 2')
        .run();
      expect(current.store.latest('room-1')?.sequence).toBe(1);
    } finally {
      current.database.close();
    }
  });

  it('returns an explicit recovery error for corrupted snapshot bytes', async () => {
    const current = await context();
    try {
      current.store.save(snapshot());
      current.database
        .prepare('UPDATE snapshots SET payload = ? WHERE room_id = ?')
        .run(Buffer.from('corrupted'), 'room-1');
      expect(() => current.store.latest('room-1')).toThrowError(
        expect.objectContaining<Partial<SnapshotRecoveryError>>({
          name: 'SnapshotRecoveryError',
          code: 'SNAPSHOT_CORRUPTED',
        }),
      );
    } finally {
      current.database.close();
    }
  });

  it('rejects legacy chip history without authoritative timestamps', async () => {
    const current = await context();
    try {
      const legacy = snapshot();
      current.store.save({
        ...legacy,
        state: {
          ...legacy.state,
          chipActivity: [
            {
              kind: 'direct-transfer',
              transferId: 'legacy-transfer',
              fromPlayerId: 'host',
              toPlayerId: 'bob',
              amount: 10,
              completedSequence: 1,
            },
          ],
        } as unknown as RoomRecoveryState,
      });

      expect(() => current.store.latest('room-1')).toThrowError(
        expect.objectContaining<Partial<SnapshotRecoveryError>>({
          name: 'SnapshotRecoveryError',
          code: 'SNAPSHOT_CORRUPTED',
        }),
      );
    } finally {
      current.database.close();
    }
  });

  it('defaults snapshots from before ROOMHOST-004 to a participating Host', async () => {
    const current = await context();
    try {
      const legacy = JSON.parse(JSON.stringify(snapshot())) as {
        state: { room: Record<string, unknown> };
      };
      delete legacy.state.room.hostId;
      delete legacy.state.room.hostNickname;
      delete legacy.state.room.hostParticipation;
      for (const player of legacy.state.room.players as Record<
        string,
        unknown
      >[]) {
        delete player.roles;
      }
      current.store.save(legacy as unknown as StoredRoomSnapshot);
      const restored = current.store.latest('room-1');
      expect(restored?.state.room).toMatchObject({
        hostId: 'host',
        hostNickname: 'Alice',
        hostParticipation: 'player',
      });
      expect(restored?.state.room.players[0]?.roles).toEqual([
        'host',
        'player',
      ]);
    } finally {
      current.database.close();
    }
  });
});
