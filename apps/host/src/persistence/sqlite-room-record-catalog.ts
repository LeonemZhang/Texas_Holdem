import type { DatabaseSync } from 'node:sqlite';

import {
  IdSchema,
  RoomRecordSummarySchema,
  type RoomRecordSummary,
} from '@texas-holdem/protocol';

interface RoomRecordRow {
  readonly room_id: string;
  readonly settings_json: string;
  readonly normal_closed: number;
  readonly archived: number;
  readonly created_at_ms: number;
  readonly updated_at_ms: number;
  readonly host_nickname: string;
  readonly player_count: number;
  readonly completed_hands: number;
}

function timestampToIso(value: number, field: string): string {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative safe integer`);
  }
  return new Date(value).toISOString();
}

function toSummary(row: RoomRecordRow): RoomRecordSummary {
  if (row.archived !== 0 && row.archived !== 1) {
    throw new RangeError('Room record archive state is invalid');
  }
  if (row.normal_closed !== 0 && row.normal_closed !== 1) {
    throw new RangeError('Room record close state is invalid');
  }
  const settings = JSON.parse(row.settings_json) as { roomName?: unknown };
  return RoomRecordSummarySchema.parse({
    roomId: row.room_id,
    roomName: settings.roomName,
    hostNickname: row.host_nickname,
    status:
      row.archived === 1
        ? 'archived'
        : row.normal_closed === 1
          ? 'closed'
          : 'recoverable',
    createdAt: timestampToIso(row.created_at_ms, 'Room record creation time'),
    lastActiveAt: timestampToIso(
      row.updated_at_ms,
      'Room record last activity time',
    ),
    completedHands: row.completed_hands,
    playerCount: row.player_count,
  });
}

export class SqliteRoomRecordCatalog {
  constructor(private readonly database: DatabaseSync) {}

  list(includeArchived = false): readonly RoomRecordSummary[] {
    const rows = this.database
      .prepare(
        `
        SELECT
          rooms.room_id,
          rooms.settings_json,
          rooms.normal_closed,
          rooms.archived,
          rooms.created_at_ms,
          rooms.updated_at_ms,
          host.nickname AS host_nickname,
          (SELECT COUNT(*) FROM players WHERE room_id = rooms.room_id) AS player_count,
          (SELECT COUNT(*) FROM hand_summaries WHERE room_id = rooms.room_id) AS completed_hands
        FROM rooms
        INNER JOIN players AS host
          ON host.room_id = rooms.room_id
          AND host.player_id = rooms.host_player_id
        WHERE ? = 1 OR rooms.archived = 0
        ORDER BY rooms.updated_at_ms DESC, rooms.room_id ASC
      `,
      )
      .all(includeArchived ? 1 : 0) as unknown as readonly RoomRecordRow[];
    return Object.freeze(rows.map(toSummary));
  }

  setArchived(roomId: string, archived: boolean): void {
    const parsedRoomId = IdSchema.parse(roomId);
    this.database
      .prepare('UPDATE rooms SET archived = ? WHERE room_id = ?')
      .run(archived ? 1 : 0, parsedRoomId);
  }

  delete(roomId: string): void {
    const parsedRoomId = IdSchema.parse(roomId);
    this.database
      .prepare('DELETE FROM rooms WHERE room_id = ?')
      .run(parsedRoomId);
  }
}
