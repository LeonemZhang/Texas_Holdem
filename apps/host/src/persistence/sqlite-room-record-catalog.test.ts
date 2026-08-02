import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { HOST_MIGRATIONS } from './migrations.js';
import { openSqliteDatabase, runSqliteMigrations } from './sqlite-database.js';
import { SqliteRoomRecordCatalog } from './sqlite-room-record-catalog.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function catalogContext() {
  const directory = await mkdtemp(join(tmpdir(), 'texas-holdem-records-'));
  temporaryDirectories.push(directory);
  const database = openSqliteDatabase(join(directory, 'room.sqlite'));
  runSqliteMigrations(database, HOST_MIGRATIONS);
  return { database, catalog: new SqliteRoomRecordCatalog(database) };
}

function insertRoom(
  database: Awaited<ReturnType<typeof catalogContext>>['database'],
  {
    roomId,
    roomName,
    normalClosed = false,
    updatedAtMs,
  }: {
    readonly roomId: string;
    readonly roomName: string;
    readonly normalClosed?: boolean;
    readonly updatedAtMs: number;
  },
) {
  database
    .prepare(
      `
      INSERT INTO rooms (
        room_id, host_player_id, phase, state_version, normal_closed,
        settings_json, created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      roomId,
      `${roomId}-host`,
      normalClosed ? 'closed' : 'playing',
      1,
      normalClosed ? 1 : 0,
      JSON.stringify({ roomName }),
      1_000,
      updatedAtMs,
    );
  database
    .prepare(
      `
      INSERT INTO players (
        room_id, player_id, nickname, seat_index, chips, status, is_host
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(roomId, `${roomId}-host`, 'Alice', 0, 2_000, 'active', 1);
}

describe('SqliteRoomRecordCatalog', () => {
  it('lists non-archived records by recent activity with recoverable and closed states', async () => {
    const { database, catalog } = await catalogContext();
    try {
      insertRoom(database, {
        roomId: 'recoverable-room',
        roomName: 'Friday poker',
        updatedAtMs: 2_000,
      });
      insertRoom(database, {
        roomId: 'closed-room',
        roomName: 'Saturday poker',
        normalClosed: true,
        updatedAtMs: 3_000,
      });

      expect(catalog.list()).toEqual([
        expect.objectContaining({
          roomId: 'closed-room',
          roomName: 'Saturday poker',
          status: 'closed',
          createdAt: '1970-01-01T00:00:01.000Z',
          lastActiveAt: '1970-01-01T00:00:03.000Z',
          playerCount: 1,
          completedHands: 0,
        }),
        expect.objectContaining({
          roomId: 'recoverable-room',
          status: 'recoverable',
        }),
      ]);
    } finally {
      database.close();
    }
  });

  it('archives records reversibly without deleting their persisted history', async () => {
    const { database, catalog } = await catalogContext();
    try {
      insertRoom(database, {
        roomId: 'room-1',
        roomName: 'Friends',
        updatedAtMs: 2_000,
      });
      database
        .prepare(
          `
          INSERT INTO events (
            room_id, sequence, event_id, state_version, event_type,
            payload_json, created_at_ms
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run('room-1', 1, 'event-1', 1, 'room.created', '{}', 1_000);

      catalog.setArchived('room-1', true);
      expect(catalog.list()).toEqual([]);
      expect(catalog.list(true)).toEqual([
        expect.objectContaining({ roomId: 'room-1', status: 'archived' }),
      ]);
      expect(
        database
          .prepare('SELECT COUNT(*) AS count FROM events WHERE room_id = ?')
          .get('room-1'),
      ).toEqual({ count: 1 });

      catalog.setArchived('room-1', false);
      expect(catalog.list()).toEqual([
        expect.objectContaining({ roomId: 'room-1', status: 'recoverable' }),
      ]);
    } finally {
      database.close();
    }
  });

  it('deletes an archived record with its persisted history', async () => {
    const { database, catalog } = await catalogContext();
    try {
      insertRoom(database, {
        roomId: 'room-1',
        roomName: 'Friends',
        updatedAtMs: 2_000,
      });
      database
        .prepare(
          `
          INSERT INTO events (
            room_id, sequence, event_id, state_version, event_type,
            payload_json, created_at_ms
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run('room-1', 1, 'event-1', 1, 'room.created', '{}', 1_000);
      database
        .prepare(
          `
          INSERT INTO snapshots (
            room_id, sequence, state_version, encoding, payload, checksum,
            valid, created_at_ms
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run('room-1', 1, 1, 'json', Buffer.from('{}'), 'checksum', 1, 1_000);
      database
        .prepare(
          `
          INSERT INTO hand_summaries (
            room_id, hand_id, sequence, summary_json, created_at_ms
          ) VALUES (?, ?, ?, ?, ?)
        `,
        )
        .run('room-1', 'hand-1', 1, '{}', 1_000);
      database
        .prepare(
          `
          INSERT INTO statistics_facts (
            room_id, fact_id, hand_id, fact_type, payload_json, created_at_ms
          ) VALUES (?, ?, ?, ?, ?, ?)
        `,
        )
        .run('room-1', 'fact-1', 'hand-1', 'player.action', '{}', 1_000);
      database
        .prepare(
          `
          INSERT INTO statistics_cache (room_id, cache_json, rebuilt_at_ms)
          VALUES (?, ?, ?)
        `,
        )
        .run('room-1', '{}', 1_000);
      database
        .prepare(
          `
          INSERT INTO players (
            room_id, player_id, nickname, seat_index, chips, status, is_host
          ) VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run('room-1', 'bob', 'Bob', 1, 1_000, 'active', 0);
      database
        .prepare(
          `
          INSERT INTO chip_requests (
            room_id, request_id, after_hand_id, requester_id, target_player_id,
            amount, note, status, rejected_by_json, updated_at_ms
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          'room-1',
          'request-1',
          'hand-1',
          'room-1-host',
          'bob',
          100,
          null,
          'completed',
          '[]',
          1_000,
        );
      database
        .prepare(
          `
          INSERT INTO chip_transfers (
            room_id, transfer_id, from_player_id, to_player_id, amount, source,
            request_id, created_at_ms
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(
          'room-1',
          'transfer-1',
          'room-1-host',
          'bob',
          100,
          'request-approval',
          'request-1',
          1_000,
        );
      catalog.setArchived('room-1', true);

      catalog.delete('room-1');

      expect(catalog.list(true)).toEqual([]);
      expect(
        database
          .prepare('SELECT COUNT(*) AS count FROM players WHERE room_id = ?')
          .get('room-1'),
      ).toEqual({ count: 0 });
      expect(
        database
          .prepare('SELECT COUNT(*) AS count FROM events WHERE room_id = ?')
          .get('room-1'),
      ).toEqual({ count: 0 });
      for (const table of [
        'snapshots',
        'hand_summaries',
        'statistics_facts',
        'statistics_cache',
        'chip_requests',
        'chip_transfers',
        'reconnect_identities',
      ]) {
        expect(
          database
            .prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE room_id = ?`)
            .get('room-1'),
        ).toEqual({ count: 0 });
      }
    } finally {
      database.close();
    }
  });
});
