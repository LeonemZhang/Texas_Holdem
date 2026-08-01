import type { DatabaseSync } from 'node:sqlite';

import type { RoomRecoveryCatalogPort } from '../application/room-recovery.js';

interface RoomCloseRow {
  readonly normal_closed: number;
}

export class SqliteRoomRecoveryCatalog implements RoomRecoveryCatalogPort {
  constructor(private readonly database: DatabaseSync) {}

  isNormallyClosed(roomId: string): boolean {
    const row = this.database
      .prepare('SELECT normal_closed FROM rooms WHERE room_id = ?')
      .get(roomId) as unknown as RoomCloseRow | undefined;
    return row?.normal_closed === 1;
  }
}
