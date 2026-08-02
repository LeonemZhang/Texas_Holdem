import { describe, expect, it } from 'vitest';

import { joinRoom } from '../domain/join-room.js';
import { createRoom } from '../domain/room.js';
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
      new SqliteRoomLifecycleStore(database).saveActive(room, 1);

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
});
