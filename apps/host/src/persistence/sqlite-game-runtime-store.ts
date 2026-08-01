import type { DatabaseSync } from 'node:sqlite';

import type { SocketAuthentication } from '@texas-holdem/protocol';

import type { GameRuntimeStateExport } from '../application/game-runtime.js';
import type { RoomRecoveryState } from '../application/persistence-ports.js';
import type { SessionIdentity } from '../application/session-authenticator.js';
import type { ReconnectRegistry, ResumeStatus } from '../domain/reconnect.js';
import { SqliteReconnectIdentityStore } from './sqlite-reconnect-identity-store.js';
import { SqliteRoomLifecycleStore } from './sqlite-room-lifecycle-store.js';
import { SqliteSnapshotStore } from './sqlite-snapshot-store.js';

interface ActiveRoomRow {
  readonly room_id: string;
}

export interface LoadedGameRuntimeState {
  readonly state: RoomRecoveryState;
  readonly sequence: number;
}

export class SqliteGameRuntimeStore {
  readonly #lifecycle: SqliteRoomLifecycleStore;
  readonly #snapshots: SqliteSnapshotStore;
  readonly #identities: SqliteReconnectIdentityStore;

  constructor(private readonly database: DatabaseSync) {
    this.#lifecycle = new SqliteRoomLifecycleStore(database);
    this.#snapshots = new SqliteSnapshotStore(database);
    this.#identities = new SqliteReconnectIdentityStore(database);
  }

  loadLatest(): LoadedGameRuntimeState | null {
    const row = this.database
      .prepare(
        `
        SELECT room_id FROM rooms
        WHERE normal_closed = 0
        ORDER BY updated_at_ms DESC
        LIMIT 1
      `,
      )
      .get() as unknown as ActiveRoomRow | undefined;
    if (!row) return null;
    const snapshot = this.#snapshots.latest(row.room_id);
    if (!snapshot) return null;
    return Object.freeze({
      state: snapshot.state,
      sequence: snapshot.sequence,
    });
  }

  save(runtime: GameRuntimeStateExport, updatedAtMs: number): void {
    if (runtime.room.phase === 'closed') {
      this.#lifecycle.markNormallyClosed(runtime.room, updatedAtMs);
    } else {
      this.#lifecycle.saveActive(runtime.room, updatedAtMs);
    }
    this.#snapshots.save({
      roomId: runtime.room.roomId,
      sequence: runtime.sequence,
      stateVersion: runtime.room.version,
      createdAtMs: updatedAtMs,
      state: {
        room: runtime.room,
        hand: runtime.hand,
        handReady: runtime.handReady,
        chipRequests: runtime.chipRequests,
      },
    });
    const registry: ReconnectRegistry = Object.freeze({
      identities: Object.freeze(
        Object.entries(runtime.reconnectTokens).map(([playerId, token]) => {
          const player = runtime.room.players.find(
            (candidate) => candidate.playerId === playerId,
          );
          const resumeStatus: ResumeStatus =
            player?.status === 'disconnected'
              ? 'waiting'
              : (player?.status ?? 'waiting');
          return Object.freeze({ playerId, token, resumeStatus });
        }),
      ),
    });
    if (registry.identities.length > 0) {
      this.#identities.save(runtime.room.roomId, registry, updatedAtMs);
    }
  }

  authenticate(credentials: SocketAuthentication): SessionIdentity | null {
    const identity = this.#identities.authenticate(
      credentials.roomId,
      credentials.token,
    );
    if (!identity || identity.playerId !== credentials.playerId) return null;
    return Object.freeze({
      roomId: credentials.roomId,
      playerId: identity.playerId,
    });
  }
}
