import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { restorePlayerFromPersistedIdentity } from '../application/reconnect-identity-store.js';
import { joinRoom } from '../domain/join-room.js';
import {
  createReconnectRegistry,
  markPlayerDisconnected,
} from '../domain/reconnect.js';
import { createRoom, freezeRoom } from '../domain/room.js';
import { HOST_MIGRATIONS } from './migrations.js';
import { openSqliteDatabase, runSqliteMigrations } from './sqlite-database.js';
import { SqliteReconnectIdentityStore } from './sqlite-reconnect-identity-store.js';
import { SqliteSnapshotStore } from './sqlite-snapshot-store.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('SqliteReconnectIdentityStore', () => {
  it('restores the original player and seat after a database restart without storing plaintext', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'texas-holdem-reconnect-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'room.sqlite');
    const token = 'bob-secret-token-123456789';
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
    room = freezeRoom({
      ...room,
      phase: 'playing',
      firstHandStarted: true,
      players: room.players.map((player) => ({ ...player, status: 'active' })),
    });
    const registry = createReconnectRegistry(room, {
      host: 'host-secret-token-123456',
      bob: token,
    });
    const disconnected = markPlayerDisconnected(room, registry, 'bob');

    const first = openSqliteDatabase(path);
    runSqliteMigrations(first, HOST_MIGRATIONS);
    first
      .prepare(
        `
        INSERT INTO rooms (
          room_id, host_player_id, phase, state_version, settings_json,
          created_at_ms, updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        room.roomId,
        room.hostPlayerId,
        disconnected.room.phase,
        disconnected.room.version,
        JSON.stringify(room.settings),
        1,
        1,
      );
    const insertPlayer = first.prepare(`
      INSERT INTO players (
        room_id, player_id, nickname, seat_index, chips, status,
        is_host, lobby_ready
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const player of disconnected.room.players) {
      insertPlayer.run(
        room.roomId,
        player.playerId,
        player.nickname,
        player.seatIndex,
        player.chips,
        player.status,
        player.playerId === room.hostPlayerId ? 1 : 0,
        player.lobbyReady ? 1 : 0,
      );
    }
    new SqliteSnapshotStore(first).save({
      roomId: room.roomId,
      sequence: 0,
      stateVersion: disconnected.room.version,
      createdAtMs: 2,
      state: {
        room: disconnected.room,
        hand: null,
        handReady: null,
        chipRequests: null,
        chipActivity: [],
      },
    });
    new SqliteReconnectIdentityStore(first, () => Buffer.alloc(16, 7)).save(
      room.roomId,
      disconnected.registry,
      2,
    );
    first.close();

    const bytes = await readFile(path);
    expect(bytes.includes(Buffer.from(token))).toBe(false);

    const reopened = openSqliteDatabase(path);
    try {
      runSqliteMigrations(reopened, HOST_MIGRATIONS);
      const snapshot = new SqliteSnapshotStore(reopened).latest(room.roomId)!;
      const identities = new SqliteReconnectIdentityStore(reopened);
      const restored = restorePlayerFromPersistedIdentity(
        snapshot.state.room,
        identities,
        token,
      );
      expect(
        restored.players.find(({ playerId }) => playerId === 'bob'),
      ).toMatchObject({
        playerId: 'bob',
        seatIndex: 1,
        chips: 100,
        status: 'active',
      });
      expect(
        identities.authenticate(room.roomId, 'wrong-secret-token-123'),
      ).toBeNull();
    } finally {
      reopened.close();
    }
  });
});
