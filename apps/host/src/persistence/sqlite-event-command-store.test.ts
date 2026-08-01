import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { PROTOCOL_VERSION, type DomainEvent } from '@texas-holdem/protocol';

import { persistCommandOutcome } from '../application/persist-command-outcome.js';
import type {
  PersistenceUnitOfWork,
  SnapshotStorePort,
} from '../application/persistence-ports.js';
import { HOST_MIGRATIONS } from './migrations.js';
import { openSqliteDatabase, runSqliteMigrations } from './sqlite-database.js';
import {
  SqliteCommandResultStore,
  SqliteEventStore,
  SqliteTransactionStore,
} from './sqlite-event-command-store.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function context(
  commandStoreOverride?: PersistenceUnitOfWork['commands'],
) {
  const directory = await mkdtemp(join(tmpdir(), 'texas-holdem-events-'));
  temporaryDirectories.push(directory);
  const database = openSqliteDatabase(join(directory, 'room.sqlite'));
  runSqliteMigrations(database, HOST_MIGRATIONS);
  database
    .prepare(
      `
      INSERT INTO rooms (
        room_id, host_player_id, phase, state_version, settings_json,
        created_at_ms, updated_at_ms
      ) VALUES ('room-1', 'host', 'playing', 1, '{}', 1, 1)
    `,
    )
    .run();
  const events = new SqliteEventStore(database, () => 10);
  const commands =
    commandStoreOverride ?? new SqliteCommandResultStore(database, () => 10);
  const snapshots: SnapshotStorePort = {
    save: () => {
      throw new Error('snapshot store is outside DB04');
    },
    latest: () => null,
  };
  const stores: PersistenceUnitOfWork = { events, commands, snapshots };
  return {
    database,
    events,
    commands,
    transactions: new SqliteTransactionStore(database, stores),
  };
}

const event: DomainEvent = {
  protocolVersion: PROTOCOL_VERSION,
  eventId: 'event-1',
  roomId: 'room-1',
  sequence: 1,
  stateVersion: 1,
  type: 'room.control-changed',
  phase: 'playing',
};
const input = {
  roomId: 'room-1',
  playerId: 'host',
  commandId: 'command-1',
  response: {
    protocolVersion: PROTOCOL_VERSION,
    commandId: 'command-1',
    status: 'accepted' as const,
    stateVersion: 1,
    sequence: 1,
  },
  events: [event],
};

describe('SQLite event and command result transaction', () => {
  it('persists events and the original acknowledgement once', async () => {
    const current = await context();
    try {
      const first = persistCommandOutcome(current.transactions, input);
      const repeated = persistCommandOutcome(current.transactions, {
        ...input,
        response: { ...input.response, stateVersion: 9, sequence: 9 },
      });

      expect(repeated).toEqual(first);
      expect(current.events.readAfter('room-1', 0)).toEqual([event]);
      expect(
        current.commands.find('room-1', 'host', 'command-1')?.response,
      ).toEqual(first);
    } finally {
      current.database.close();
    }
  });

  it('rolls back an appended event when acknowledgement persistence crashes', async () => {
    const current = await context({
      save: () => {
        throw new Error('simulated ack write crash');
      },
      find: () => null,
    });
    try {
      expect(() => persistCommandOutcome(current.transactions, input)).toThrow(
        'simulated ack write crash',
      );
      expect(current.events.readAfter('room-1', 0)).toEqual([]);
    } finally {
      current.database.close();
    }
  });
});
