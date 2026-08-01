import type { DomainEvent } from '@texas-holdem/protocol';

import type { ChipRequestBook } from '../domain/chip-requests.js';
import type {
  ChipTransferRecord,
  ChipTransferResult,
} from '../domain/chip-transfers.js';
import type { RoomState } from '../domain/room.js';
import type { EventStorePort } from './persistence-ports.js';

export interface ChipLedgerStorePort {
  saveRequests(book: ChipRequestBook, updatedAtMs: number): void;
  loadRequests(roomId: string, afterHandId: string): ChipRequestBook | null;
  updatePlayerBalances(room: RoomState): void;
  saveTransfer(
    roomId: string,
    transfer: ChipTransferRecord,
    createdAtMs: number,
  ): void;
}

export interface ChipTransferUnitOfWork {
  readonly events: EventStorePort;
  readonly chips: ChipLedgerStorePort;
}

export interface ChipTransferTransactionPort {
  run<Result>(operation: (stores: ChipTransferUnitOfWork) => Result): Result;
}

export interface PersistChipTransferInput {
  readonly beforeRoom: RoomState;
  readonly result: ChipTransferResult;
  readonly event: DomainEvent;
  readonly persistedAtMs: number;
}

export function persistChipTransfer(
  transaction: ChipTransferTransactionPort,
  input: PersistChipTransferInput,
): void {
  const beforeTotal = input.beforeRoom.players.reduce(
    (sum, player) => sum + player.chips,
    0,
  );
  const afterTotal = input.result.room.players.reduce(
    (sum, player) => sum + player.chips,
    0,
  );
  if (
    beforeTotal !== afterTotal ||
    input.beforeRoom.roomId !== input.result.room.roomId ||
    input.event.roomId !== input.result.room.roomId ||
    input.event.type !== 'chips.transfer-completed' ||
    input.event.transferId !== input.result.transfer.transferId
  ) {
    throw new RangeError('Chip transfer persistence input is inconsistent');
  }
  transaction.run((stores) => {
    stores.chips.updatePlayerBalances(input.result.room);
    stores.chips.saveRequests(input.result.requests, input.persistedAtMs);
    stores.chips.saveTransfer(
      input.result.room.roomId,
      input.result.transfer,
      input.persistedAtMs,
    );
    stores.events.append([input.event]);
  });
}
