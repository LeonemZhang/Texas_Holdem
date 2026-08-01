import type { DatabaseSync } from 'node:sqlite';

import type { RoomState } from '../domain/room.js';

export class SqliteRoomLifecycleStore {
  constructor(private readonly database: DatabaseSync) {}

  saveActive(room: RoomState, updatedAtMs: number): void {
    if (room.phase === 'closed') {
      throw new RangeError('A closed room cannot be saved as active');
    }
    this.save(room, updatedAtMs, false);
  }

  markNormallyClosed(room: RoomState, updatedAtMs: number): void {
    if (room.phase !== 'closed') {
      throw new RangeError('Only a closed room can be marked normally closed');
    }
    this.save(room, updatedAtMs, true);
  }

  private save(
    room: RoomState,
    updatedAtMs: number,
    normallyClosed: boolean,
  ): void {
    if (!Number.isSafeInteger(updatedAtMs) || updatedAtMs < 0) {
      throw new RangeError('Room update time must be a non-negative integer');
    }
    this.database
      .prepare(
        `
        INSERT INTO rooms (
          room_id, host_player_id, phase, state_version, normal_closed,
          settings_json, created_at_ms, updated_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(room_id) DO UPDATE SET
          host_player_id = excluded.host_player_id,
          phase = excluded.phase,
          state_version = excluded.state_version,
          normal_closed = excluded.normal_closed,
          settings_json = excluded.settings_json,
          updated_at_ms = excluded.updated_at_ms
      `,
      )
      .run(
        room.roomId,
        room.hostPlayerId,
        room.phase,
        room.version,
        normallyClosed ? 1 : 0,
        JSON.stringify(room.settings),
        updatedAtMs,
        updatedAtMs,
      );
  }
}
