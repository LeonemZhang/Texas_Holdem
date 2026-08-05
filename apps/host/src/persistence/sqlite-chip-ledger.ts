import type { DatabaseSync } from 'node:sqlite';

import type {
  ChipLedgerStorePort,
  ChipTransferTransactionPort,
  ChipTransferUnitOfWork,
} from '../application/chip-persistence-ports.js';
import {
  freezeChipRequestBook,
  type ChipRequest,
  type ChipRequestBook,
} from '../domain/chip-requests.js';
import type { ChipTransferRecord } from '../domain/chip-transfers.js';
import type { RoomState } from '../domain/room.js';

interface ChipRequestRow {
  readonly request_id: string;
  readonly requester_id: string;
  readonly target_player_id: string;
  readonly amount: number;
  readonly note: string | null;
  readonly status: ChipRequest['status'];
  readonly rejected_by_json: string;
}

export class SqliteChipLedgerStore implements ChipLedgerStorePort {
  constructor(private readonly database: DatabaseSync) {}

  saveRequests(book: ChipRequestBook, updatedAtMs: number): void {
    this.database
      .prepare(
        'DELETE FROM chip_requests WHERE room_id = ? AND after_hand_id = ?',
      )
      .run(book.roomId, book.afterHandId);
    const insert = this.database.prepare(`
      INSERT INTO chip_requests (
        room_id, request_id, after_hand_id, requester_id, target_player_id,
        amount, note, status, rejected_by_json, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const request of book.requests) {
      insert.run(
        book.roomId,
        request.requestId,
        book.afterHandId,
        request.requesterId,
        request.targetPlayerId,
        request.amount,
        request.note,
        request.status,
        JSON.stringify(request.rejectedByPlayerIds),
        updatedAtMs,
      );
    }
  }

  loadRequests(roomId: string, afterHandId: string): ChipRequestBook | null {
    const rows = this.database
      .prepare(
        `
        SELECT request_id, requester_id, target_player_id, amount, note,
               status, rejected_by_json
        FROM chip_requests
        WHERE room_id = ? AND after_hand_id = ?
        ORDER BY rowid
      `,
      )
      .all(roomId, afterHandId) as unknown as ChipRequestRow[];
    if (rows.length === 0) return null;
    return freezeChipRequestBook({
      roomId,
      afterHandId,
      requests: rows.map((row) => ({
        requestId: row.request_id,
        requesterId: row.requester_id,
        targetPlayerId: row.target_player_id,
        amount: row.amount,
        note: row.note,
        status: row.status,
        rejectedByPlayerIds: JSON.parse(row.rejected_by_json) as string[],
      })),
    });
  }

  updatePlayerBalances(room: RoomState): void {
    const update = this.database.prepare(`
      UPDATE players SET chips = ? WHERE room_id = ? AND player_id = ?
    `);
    for (const player of room.players) {
      const result = update.run(player.chips, room.roomId, player.playerId);
      if (result.changes !== 1) {
        throw new RangeError(`Persisted player not found: ${player.playerId}`);
      }
    }
  }

  saveTransfer(
    roomId: string,
    transfer: ChipTransferRecord,
    createdAtMs: number,
  ): void {
    this.database
      .prepare(
        `
        INSERT INTO chip_transfers (
          room_id, transfer_id, from_player_id, to_player_id, amount,
          source, request_id, created_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .run(
        roomId,
        transfer.transferId,
        transfer.fromPlayerId,
        transfer.toPlayerId,
        transfer.amount,
        transfer.source,
        transfer.requestId,
        createdAtMs,
      );
  }
}

export class SqliteChipTransferTransaction implements ChipTransferTransactionPort {
  constructor(
    private readonly database: DatabaseSync,
    private readonly stores: ChipTransferUnitOfWork,
  ) {}

  run<Result>(operation: (stores: ChipTransferUnitOfWork) => Result): Result {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = operation(this.stores);
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}
