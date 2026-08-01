import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { PROTOCOL_VERSION } from '@texas-holdem/protocol';

import { persistChipTransfer } from '../application/chip-persistence-ports.js';
import {
  createChipRequest,
  createChipRequestBook,
} from '../domain/chip-requests.js';
import { approveChipRequest } from '../domain/chip-transfers.js';
import { beginHandReadyPhase } from '../domain/hand-ready.js';
import { joinRoom } from '../domain/join-room.js';
import { createRoom, freezeRoom } from '../domain/room.js';
import { HOST_MIGRATIONS } from './migrations.js';
import { openSqliteDatabase, runSqliteMigrations } from './sqlite-database.js';
import { SqliteEventStore } from './sqlite-event-command-store.js';
import {
  SqliteChipLedgerStore,
  SqliteChipTransferTransaction,
} from './sqlite-chip-ledger.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function transferResult() {
  let room = createRoom({
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
  room = joinRoom(room, { playerId: 'bob', nickname: 'Bob' });
  room = freezeRoom({ ...room, phase: 'playing', firstHandStarted: true });
  const ready = beginHandReadyPhase(room, 'hand-1', 1_000);
  let requests = createChipRequestBook(ready.handReady);
  requests = createChipRequest(ready.room, ready.handReady, requests, {
    requestId: 'request-1',
    requesterId: 'bob',
    targetPlayerId: 'host',
    amount: 20,
  });
  const result = approveChipRequest(
    ready.room,
    requests,
    'request-1',
    'host',
    'transfer-1',
  );
  return { beforeRoom: ready.room, result };
}

async function context() {
  const directory = await mkdtemp(join(tmpdir(), 'texas-holdem-chips-'));
  temporaryDirectories.push(directory);
  const database = openSqliteDatabase(join(directory, 'room.sqlite'));
  runSqliteMigrations(database, HOST_MIGRATIONS);
  const { beforeRoom } = transferResult();
  database
    .prepare(
      `
      INSERT INTO rooms (
        room_id, host_player_id, phase, state_version, settings_json,
        created_at_ms, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .run(
      beforeRoom.roomId,
      beforeRoom.hostPlayerId,
      beforeRoom.phase,
      beforeRoom.version,
      JSON.stringify(beforeRoom.settings),
      1,
      1,
    );
  const insertPlayer = database.prepare(`
    INSERT INTO players (
      room_id, player_id, nickname, seat_index, chips, status,
      is_host, lobby_ready
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const player of beforeRoom.players) {
    insertPlayer.run(
      beforeRoom.roomId,
      player.playerId,
      player.nickname,
      player.seatIndex,
      player.chips,
      player.status,
      player.playerId === beforeRoom.hostPlayerId ? 1 : 0,
      player.lobbyReady ? 1 : 0,
    );
  }
  return database;
}

const event = {
  protocolVersion: PROTOCOL_VERSION,
  eventId: 'event-1',
  roomId: 'room-1',
  sequence: 1,
  stateVersion: 4,
  type: 'chips.transfer-completed' as const,
  transferId: 'transfer-1',
  fromPlayerId: 'host',
  toPlayerId: 'bob',
  amount: 20,
};

describe('SQLite chip ledger transaction', () => {
  it('atomically saves balances, request completion, transfer and event', async () => {
    const database = await context();
    const chips = new SqliteChipLedgerStore(database);
    const events = new SqliteEventStore(database, () => 2_000);
    const transaction = new SqliteChipTransferTransaction(database, {
      chips,
      events,
    });
    const transfer = transferResult();
    try {
      persistChipTransfer(transaction, {
        ...transfer,
        event,
        persistedAtMs: 2_000,
      });

      const balances = database
        .prepare('SELECT player_id, chips FROM players ORDER BY seat_index')
        .all() as unknown as Array<{ player_id: string; chips: number }>;
      expect(balances).toEqual([
        { player_id: 'host', chips: 80 },
        { player_id: 'bob', chips: 120 },
      ]);
      expect(balances.reduce((sum, player) => sum + player.chips, 0)).toBe(200);
      expect(chips.loadRequests('room-1', 'hand-1')?.requests[0]?.status).toBe(
        'completed',
      );
      expect(
        database.prepare('SELECT source FROM chip_transfers').get(),
      ).toMatchObject({ source: 'request-approval' });
      expect(events.readAfter('room-1', 0)).toEqual([event]);
    } finally {
      database.close();
    }
  });

  it('rolls back balances and ledger rows if the final event write crashes', async () => {
    const database = await context();
    const chips = new SqliteChipLedgerStore(database);
    const transaction = new SqliteChipTransferTransaction(database, {
      chips,
      events: {
        append: () => {
          throw new Error('simulated event crash');
        },
        readAfter: () => [],
        latestSequence: () => 0,
      },
    });
    const transfer = transferResult();
    try {
      expect(() =>
        persistChipTransfer(transaction, {
          ...transfer,
          event,
          persistedAtMs: 2_000,
        }),
      ).toThrow('simulated event crash');
      const balances = database
        .prepare('SELECT chips FROM players ORDER BY seat_index')
        .all() as unknown as Array<{ chips: number }>;
      expect(balances.map(({ chips: amount }) => amount)).toEqual([100, 100]);
      expect(
        database.prepare('SELECT COUNT(*) count FROM chip_transfers').get(),
      ).toMatchObject({ count: 0 });
      expect(
        database.prepare('SELECT COUNT(*) count FROM chip_requests').get(),
      ).toMatchObject({ count: 0 });
    } finally {
      database.close();
    }
  });
});
