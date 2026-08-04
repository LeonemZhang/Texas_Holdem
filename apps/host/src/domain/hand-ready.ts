import { freezeRoom, type RoomState } from './room.js';

export type HandReadyChoice = 'pending' | 'ready' | 'sitting-out';

export interface HandReadyPlayerState {
  readonly playerId: string;
  readonly choice: HandReadyChoice;
}

export interface HandReadyState {
  readonly roomId: string;
  readonly afterHandId: string;
  readonly startedAtMs: number;
  readonly deadlineMs: number;
  readonly players: readonly HandReadyPlayerState[];
}

export interface BeginHandReadyResult {
  readonly room: RoomState;
  readonly handReady: HandReadyState;
}

function assertTimestamp(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError('Injected time must be a non-negative safe integer');
  }
}

export function beginHandReadyPhase(
  room: RoomState,
  afterHandId: string,
  nowMs: number,
): BeginHandReadyResult {
  if (room.phase !== 'playing' || !room.firstHandStarted) {
    throw new RangeError('Hand readiness can only follow a started hand');
  }
  if (!afterHandId.trim())
    throw new RangeError('Completed hand id cannot be empty');
  assertTimestamp(nowMs);
  const deadlineMs = nowMs + room.settings.handReadyTimeoutSeconds * 1_000;
  assertTimestamp(deadlineMs);
  const handReady = Object.freeze({
    roomId: room.roomId,
    afterHandId,
    startedAtMs: nowMs,
    deadlineMs,
    players: Object.freeze(
      room.players
        .filter(
          ({ status }) => !['left', 'removed', 'eliminated'].includes(status),
        )
        .map(({ playerId }) =>
          Object.freeze({ playerId, choice: 'pending' as const }),
        ),
    ),
  });
  return Object.freeze({
    room: freezeRoom({
      ...room,
      phase: 'hand-ready',
      version: room.version + 1,
    }),
    handReady,
  });
}
