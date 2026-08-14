import type { DatabaseSync } from 'node:sqlite';

import { IdSchema, type SocketAuthentication } from '@texas-holdem/protocol';

import type { GameRuntimeStateExport } from '../application/game-runtime.js';
import type { RoomRecoveryState } from '../application/persistence-ports.js';
import type { SessionIdentity } from '../application/session-authenticator.js';
import type { ReconnectRegistry, ResumeStatus } from '../domain/reconnect.js';
import { SqliteReconnectIdentityStore } from './sqlite-reconnect-identity-store.js';
import { SqliteHostReconnectIdentityStore } from './sqlite-host-reconnect-identity-store.js';
import { SqliteRoomLifecycleStore } from './sqlite-room-lifecycle-store.js';
import { SqliteSnapshotStore } from './sqlite-snapshot-store.js';

interface RecoverableRoomRow {
  readonly normal_closed: number;
  readonly archived: number;
}

export interface LoadedGameRuntimeState {
  readonly state: RoomRecoveryState;
  readonly sequence: number;
}

export class SqliteGameRuntimeStore {
  readonly #lifecycle: SqliteRoomLifecycleStore;
  readonly #snapshots: SqliteSnapshotStore;
  readonly #identities: SqliteReconnectIdentityStore;
  readonly #hostIdentities: SqliteHostReconnectIdentityStore;

  constructor(
    private readonly database: DatabaseSync,
    network: { readonly name: string; readonly address: string } | null = null,
  ) {
    this.#lifecycle = new SqliteRoomLifecycleStore(database, network);
    this.#snapshots = new SqliteSnapshotStore(database);
    this.#identities = new SqliteReconnectIdentityStore(database);
    this.#hostIdentities = new SqliteHostReconnectIdentityStore(database);
  }

  loadRecoverable(roomId: string): LoadedGameRuntimeState | null {
    const parsedRoomId = IdSchema.parse(roomId);
    const row = this.database
      .prepare(
        `
        SELECT normal_closed, archived FROM rooms
        WHERE room_id = ?
      `,
      )
      .get(parsedRoomId) as unknown as RecoverableRoomRow | undefined;
    if (!row || row.normal_closed === 1 || row.archived === 1) return null;
    const snapshot = this.#snapshots.latest(parsedRoomId);
    if (!snapshot) return null;
    return Object.freeze({
      state: snapshot.state,
      sequence: snapshot.sequence,
    });
  }

  loadLatestState(roomId: string): RoomRecoveryState | null {
    const parsedRoomId = IdSchema.parse(roomId);
    return this.#snapshots.latest(parsedRoomId)?.state ?? null;
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
        chipActivity: runtime.chipActivity,
      },
    });
    const registry: ReconnectRegistry = Object.freeze({
      identities: Object.freeze(
        Object.entries(runtime.reconnectTokens).flatMap(([playerId, token]) => {
          const player = runtime.room.players.find(
            (candidate) => candidate.playerId === playerId,
          );
          if (!player) return [];
          if (player?.status === 'removed') return [];
          const resumeStatus: ResumeStatus =
            player?.status === 'disconnected'
              ? 'waiting'
              : (player?.status ?? 'waiting');
          return [Object.freeze({ playerId, token, resumeStatus })];
        }),
      ),
    });
    if (registry.identities.length > 0) {
      this.#identities.save(runtime.room.roomId, registry, updatedAtMs);
    }
    const hostToken =
      runtime.reconnectTokens[
        runtime.room.hostParticipation === 'service-only'
          ? runtime.room.hostId
          : runtime.room.hostPlayerId
      ];
    if (hostToken) {
      this.#hostIdentities.save(
        runtime.room.roomId,
        runtime.room.hostId,
        hostToken,
        updatedAtMs,
      );
    }
  }

  authenticate(credentials: SocketAuthentication): SessionIdentity | null {
    if (credentials.sessionType === 'host') {
      const hostId = credentials.hostId ?? credentials.playerId;
      if (credentials.playerId !== hostId) return null;
      const identity = this.#hostIdentities.authenticate(
        credentials.roomId,
        hostId,
        credentials.token,
      );
      return identity
        ? Object.freeze({
            roomId: credentials.roomId,
            playerId: hostId,
            hostId,
            sessionType: 'host' as const,
          })
        : null;
    }
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
