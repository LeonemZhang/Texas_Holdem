import { describe, expect, it } from 'vitest';

import { joinRoom } from '../domain/join-room.js';
import { createRoom } from '../domain/room.js';
import { reseatPlayer, shuffleLobbySeats } from '../domain/seat-management.js';
import { HOST_MIGRATIONS } from './migrations.js';
import { openSqliteDatabase, runSqliteMigrations } from './sqlite-database.js';
import { SqliteRoomLifecycleStore } from './sqlite-room-lifecycle-store.js';

describe('SqliteRoomLifecycleStore', () => {
  it('upserts room metadata and every persistent player seat', () => {
    const database = openSqliteDatabase(':memory:');
    try {
      runSqliteMigrations(database, HOST_MIGRATIONS);
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
      new SqliteRoomLifecycleStore(database, {
        name: 'Virtual LAN',
        address: '10.126.126.1',
      }).saveActive(room, 1);

      expect(
        database
          .prepare(
            'SELECT network_name, network_address FROM rooms WHERE room_id = ?',
          )
          .get('room-1'),
      ).toEqual({
        network_name: 'Virtual LAN',
        network_address: '10.126.126.1',
      });

      expect(
        database
          .prepare(
            `
            SELECT player_id, seat_index, chips, is_host, lobby_ready
            FROM players WHERE room_id = ? ORDER BY seat_index
          `,
          )
          .all('room-1'),
      ).toEqual([
        {
          player_id: 'host',
          seat_index: 0,
          chips: 100,
          is_host: 1,
          lobby_ready: 1,
        },
        {
          player_id: 'bob',
          seat_index: 1,
          chips: 100,
          is_host: 0,
          lobby_ready: 0,
        },
      ]);
    } finally {
      database.close();
    }
  });

  it('persists occupied-seat exchanges and shuffles without transient uniqueness conflicts', () => {
    const database = openSqliteDatabase(':memory:');
    try {
      runSqliteMigrations(database, HOST_MIGRATIONS);
      let room = createRoom({
        roomId: 'room-swap',
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
      const store = new SqliteRoomLifecycleStore(database);
      store.saveActive(room, 1);

      const swapped = reseatPlayer(room, 'host', 'host', 1);
      expect(() => store.saveActive(swapped, 2)).not.toThrow();
      expect(
        database
          .prepare(
            `
            SELECT player_id, seat_index
            FROM players WHERE room_id = ? ORDER BY seat_index
          `,
          )
          .all('room-swap'),
      ).toEqual([
        { player_id: 'bob', seat_index: 0 },
        { player_id: 'host', seat_index: 1 },
      ]);

      const shuffled = shuffleLobbySeats(swapped, 'host', { next: () => 0 });
      expect(() => store.saveActive(shuffled, 3)).not.toThrow();
      expect(
        database
          .prepare(
            `
            SELECT player_id, seat_index
            FROM players WHERE room_id = ? ORDER BY seat_index
          `,
          )
          .all('room-swap'),
      ).toEqual([
        { player_id: 'host', seat_index: 0 },
        { player_id: 'bob', seat_index: 1 },
      ]);
    } finally {
      database.close();
    }
  });
});
