import { freezeRoom, type RoomState } from './room.js';

export type HandReadyChoice = 'pending' | 'ready' | 'sitting-out';
export type ChipResetVote = 'pending' | 'approve' | 'reject';

export interface HandReadyPlayerState {
  readonly playerId: string;
  readonly choice: HandReadyChoice;
}

export interface ChipResetVotePlayerState {
  readonly playerId: string;
  readonly vote: ChipResetVote;
}

export interface ChipResetVoteState {
  /** Omitted for an active vote; retained as failed for the client result view. */
  readonly status?: 'failed';
  readonly initialChips: number;
  readonly insufficientPlayerIds: readonly string[];
  readonly players: readonly ChipResetVotePlayerState[];
}

export interface HandReadyState {
  readonly roomId: string;
  readonly afterHandId: string;
  readonly startedAtMs: number;
  readonly deadlineMs: number;
  readonly players: readonly HandReadyPlayerState[];
  readonly chipResetVote: ChipResetVoteState | null;
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
  bigBlind = room.currentBigBlind,
): BeginHandReadyResult {
  if (room.phase !== 'playing' || !room.firstHandStarted) {
    throw new RangeError('Hand readiness can only follow a started hand');
  }
  if (!afterHandId.trim())
    throw new RangeError('Completed hand id cannot be empty');
  assertTimestamp(nowMs);
  const deadlineMs = nowMs + room.settings.handReadyTimeoutSeconds * 1_000;
  assertTimestamp(deadlineMs);
  if (!Number.isSafeInteger(bigBlind) || bigBlind <= 0) {
    throw new RangeError('Big blind must be a positive safe integer');
  }
  const votingPlayers = room.players.filter(
    ({ status }) => !['left', 'removed'].includes(status),
  );
  const insufficientPlayerIds = votingPlayers
    .filter(({ chips }) => chips < bigBlind)
    .map(({ playerId }) => playerId);
  const chipResetVote =
    room.settings.zeroChipPolicy === 'request-chips' &&
    insufficientPlayerIds.length > 0
      ? Object.freeze({
          initialChips: room.settings.initialChips,
          insufficientPlayerIds: Object.freeze(insufficientPlayerIds),
          players: Object.freeze(
            votingPlayers.map(({ playerId }) =>
              Object.freeze({ playerId, vote: 'pending' as const }),
            ),
          ),
        })
      : null;
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
    chipResetVote,
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
