import type { StartedHandState } from '@texas-holdem/poker-core';
import type {
  ChipActivity,
  CommandResponse,
  DomainEvent,
} from '@texas-holdem/protocol';

import type { ChipRequestBook } from '../domain/chip-requests.js';
import type { HandReadyState } from '../domain/hand-ready.js';
import type { RoomState } from '../domain/room.js';

export interface RoomRecoveryState {
  readonly room: RoomState;
  readonly hand: StartedHandState | null;
  readonly handReady: HandReadyState | null;
  readonly chipRequests: ChipRequestBook | null;
  readonly chipActivity: readonly ChipActivity[];
}

export interface StoredRoomSnapshot {
  readonly roomId: string;
  readonly sequence: number;
  readonly stateVersion: number;
  readonly createdAtMs: number;
  readonly state: RoomRecoveryState;
}

export interface StoredCommandResult {
  readonly roomId: string;
  readonly playerId: string;
  readonly commandId: string;
  readonly response: CommandResponse;
}

export interface EventStorePort {
  append(events: readonly DomainEvent[]): void;
  readAfter(roomId: string, sequence: number): readonly DomainEvent[];
  latestSequence(roomId: string): number;
}

export interface SnapshotStorePort {
  save(snapshot: StoredRoomSnapshot): void;
  latest(roomId: string): StoredRoomSnapshot | null;
}

export interface CommandResultStorePort {
  save(result: StoredCommandResult): void;
  find(
    roomId: string,
    playerId: string,
    commandId: string,
  ): StoredCommandResult | null;
}

export interface PersistenceUnitOfWork {
  readonly events: EventStorePort;
  readonly snapshots: SnapshotStorePort;
  readonly commands: CommandResultStorePort;
}

export interface TransactionPort {
  run<Result>(operation: (stores: PersistenceUnitOfWork) => Result): Result;
}
