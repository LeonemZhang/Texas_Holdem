import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { HOST_MIGRATIONS } from './migrations.js';
import { openSqliteDatabase, runSqliteMigrations } from './sqlite-database.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function migratedDatabase() {
  const directory = await mkdtemp(join(tmpdir(), 'texas-holdem-schema-'));
  temporaryDirectories.push(directory);
  const database = openSqliteDatabase(join(directory, 'room.sqlite'));
  runSqliteMigrations(database, HOST_MIGRATIONS);
  return database;
}

function insertRoom(database: Awaited<ReturnType<typeof migratedDatabase>>) {
  database
    .prepare(
      `
      INSERT INTO rooms (
        room_id, host_player_id, phase, state_version, settings_json,
        created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run('room-1', 'host', 'lobby', 0, '{}', 1, 1);
}

describe('host SQLite schema', () => {
  it('creates the current room, player, event and snapshot tables and indexes', async () => {
    const database = await migratedDatabase();
    try {
      const objects = database
        .prepare(
          `
          SELECT name FROM sqlite_master
          WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%'
        `,
        )
        .all() as unknown as Array<{ name: string }>;
      expect(objects.map(({ name }) => name)).toEqual(
        expect.arrayContaining([
          'rooms',
          'players',
          'events',
          'snapshots',
          'idx_events_room_sequence',
          'idx_snapshots_room_latest',
        ]),
      );
      expect(database.prepare('PRAGMA foreign_keys').get()).toMatchObject({
        foreign_keys: 1,
      });
    } finally {
      database.close();
    }
  });

  it('enforces foreign keys and room-scoped seat, nickname and sequence uniqueness', async () => {
    const database = await migratedDatabase();
    try {
      insertRoom(database);
      const insertPlayer = database.prepare(`
        INSERT INTO players (
          room_id, player_id, nickname, seat_index, chips, status, is_host
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      insertPlayer.run('room-1', 'host', 'Alice', 0, 100, 'waiting', 1);
      expect(() =>
        insertPlayer.run('room-1', 'bob', 'alice', 1, 100, 'waiting', 0),
      ).toThrow();
      expect(() =>
        insertPlayer.run('room-1', 'bob', 'Bob', 0, 100, 'waiting', 0),
      ).toThrow();
      expect(() =>
        insertPlayer.run('missing-room', 'bob', 'Bob', 1, 100, 'waiting', 0),
      ).toThrow();

      const insertEvent = database.prepare(`
        INSERT INTO events (
          room_id, sequence, event_id, state_version, event_type,
          payload_json, created_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      insertEvent.run('room-1', 1, 'event-1', 1, 'room.created', '{}', 1);
      expect(() =>
        insertEvent.run('room-1', 1, 'event-2', 2, 'player.joined', '{}', 2),
      ).toThrow();
    } finally {
      database.close();
    }
  });

  it('only marks a room normally closed when its phase is closed', async () => {
    const database = await migratedDatabase();
    try {
      expect(() =>
        database
          .prepare(
            `
            INSERT INTO rooms (
              room_id, host_player_id, phase, state_version, normal_closed,
              settings_json, created_at_ms, updated_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `,
          )
          .run('room-1', 'host', 'playing', 1, 1, '{}', 1, 2),
      ).toThrow();
    } finally {
      database.close();
    }
  });
});
