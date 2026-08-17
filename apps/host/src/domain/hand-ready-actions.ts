import type { RoomState } from './room.js';
import type {
  ChipResetVote,
  ChipResetVotePlayerState,
  HandReadyChoice,
  HandReadyState,
} from './hand-ready.js';

function freezeHandReady(state: HandReadyState): HandReadyState {
  const chipResetVote = state.chipResetVote ?? null;
  return Object.freeze({
    ...state,
    players: Object.freeze(
      state.players.map((player) => Object.freeze({ ...player })),
    ),
    chipResetVote: chipResetVote
      ? Object.freeze({
          ...chipResetVote,
          insufficientPlayerIds: Object.freeze([
            ...chipResetVote.insufficientPlayerIds,
          ]),
          players: Object.freeze(
            chipResetVote.players.map((player): ChipResetVotePlayerState =>
              Object.freeze({ ...player }),
            ),
          ),
        })
      : null,
  });
}

function refreshedDeadline(
  state: HandReadyState,
  nowMs: number | undefined,
): Pick<HandReadyState, 'startedAtMs' | 'deadlineMs'> {
  if (nowMs === undefined) {
    return {
      startedAtMs: state.startedAtMs,
      deadlineMs: state.deadlineMs,
    };
  }
  if (!Number.isSafeInteger(nowMs) || nowMs < 0) {
    throw new RangeError('Injected time must be a non-negative safe integer');
  }
  const durationMs = state.deadlineMs - state.startedAtMs;
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0) {
    throw new RangeError('Hand-ready deadline duration must be positive');
  }
  const deadlineMs = nowMs + durationMs;
  if (!Number.isSafeInteger(deadlineMs)) {
    throw new RangeError('Hand-ready deadline exceeds safe integer range');
  }
  return { startedAtMs: nowMs, deadlineMs };
}

function activeChipResetVote(
  state: HandReadyState,
): NonNullable<HandReadyState['chipResetVote']> | null {
  const vote = state.chipResetVote;
  return vote && vote.status !== 'failed' ? vote : null;
}

export function setHandReadyChoice(
  room: RoomState,
  state: HandReadyState,
  playerId: string,
  choice: Exclude<HandReadyChoice, 'pending'>,
  bigBlind = room.settings.bigBlind,
): HandReadyState {
  if (room.phase !== 'hand-ready' || state.roomId !== room.roomId) {
    throw new RangeError('Room is not in this hand-ready phase');
  }
  const readiness = state.players.find(
    (player) => player.playerId === playerId,
  );
  const roomPlayer = room.players.find(
    (player) => player.playerId === playerId,
  );
  if (!readiness || !roomPlayer) {
    throw new RangeError(`Player is not in hand readiness: ${playerId}`);
  }
  if (choice === 'ready' && roomPlayer.chips < bigBlind) {
    throw new RangeError(
      'A player needs at least the big blind to become ready',
    );
  }
  return freezeHandReady({
    ...state,
    players: state.players.map((player) =>
      player.playerId === playerId ? { ...player, choice } : player,
    ),
  });
}

export function normalizeHandReadyAtDeadline(
  _room: RoomState,
  state: HandReadyState,
  nowMs: number,
): HandReadyState {
  if (!Number.isSafeInteger(nowMs) || nowMs < state.deadlineMs) {
    throw new RangeError('Hand-ready deadline has not elapsed');
  }
  if (activeChipResetVote(state)) return freezeHandReady(state);
  return freezeHandReady({
    ...state,
    players: state.players.map((player) =>
      player.choice !== 'pending'
        ? player
        : { ...player, choice: 'sitting-out' },
    ),
  });
}

export function canBeginNextHand(
  state: HandReadyState,
  pendingRequestCount: number,
): boolean {
  if (!Number.isSafeInteger(pendingRequestCount) || pendingRequestCount < 0) {
    throw new RangeError(
      'Pending request count must be a non-negative safe integer',
    );
  }
  return (
    pendingRequestCount === 0 &&
    !activeChipResetVote(state) &&
    state.players.every(({ choice }) => choice !== 'pending')
  );
}

export function setChipResetVote(
  room: RoomState,
  state: HandReadyState,
  playerId: string,
  vote: Exclude<ChipResetVote, 'pending'>,
): HandReadyState {
  if (room.phase !== 'hand-ready' || state.roomId !== room.roomId) {
    throw new RangeError('Room is not in this hand-ready phase');
  }
  const currentVote = activeChipResetVote(state);
  if (!currentVote) {
    throw new RangeError('Chip reset vote is not active');
  }
  if (
    !currentVote.players.some(({ playerId: voterId }) => voterId === playerId)
  ) {
    throw new RangeError(`Player is not in chip reset vote: ${playerId}`);
  }
  return freezeHandReady({
    ...state,
    chipResetVote: {
      ...currentVote,
      players: currentVote.players.map((player) =>
        player.playerId === playerId ? { ...player, vote } : player,
      ),
    },
  });
}

export function startChipResetVote(
  room: RoomState,
  state: HandReadyState,
  bigBlind = room.currentBigBlind,
): HandReadyState {
  if (room.phase !== 'hand-ready' || state.roomId !== room.roomId) {
    throw new RangeError('Room is not in this hand-ready phase');
  }
  if (room.settings.zeroChipPolicy !== 'request-chips') {
    throw new RangeError('Chip reset vote is disabled by the room policy');
  }
  if (activeChipResetVote(state)) {
    throw new RangeError('Chip reset vote is already active');
  }
  if (!Number.isSafeInteger(bigBlind) || bigBlind <= 0) {
    throw new RangeError('Big blind must be a positive safe integer');
  }

  const voterIds = state.players
    .filter(({ playerId }) => {
      const player = room.players.find(
        (candidate) => candidate.playerId === playerId,
      );
      return (
        player !== undefined && !['left', 'removed'].includes(player.status)
      );
    })
    .map(({ playerId }) => playerId);
  if (voterIds.length === 0) {
    throw new RangeError('Chip reset vote has no eligible voters');
  }

  return freezeHandReady({
    ...state,
    chipResetVote: {
      initialChips: room.settings.initialChips,
      insufficientPlayerIds: voterIds.filter((playerId) => {
        const player = room.players.find(
          (candidate) => candidate.playerId === playerId,
        );
        return player !== undefined && player.chips < bigBlind;
      }),
      players: voterIds.map((playerId) => ({
        playerId,
        vote: 'pending' as const,
      })),
    },
  });
}

export function chipResetVoteApproved(state: HandReadyState): boolean {
  const vote = activeChipResetVote(state);
  return Boolean(
    vote &&
    vote.players.length > 0 &&
    vote.players.every(({ vote }) => vote === 'approve'),
  );
}

export function clearChipResetVote(
  state: HandReadyState,
  nowMs?: number,
): HandReadyState {
  return freezeHandReady({
    ...state,
    ...refreshedDeadline(state, nowMs),
    chipResetVote: null,
  });
}

export function failChipResetVote(
  state: HandReadyState,
  nowMs?: number,
): HandReadyState {
  const vote = activeChipResetVote(state);
  if (!vote) {
    throw new RangeError('Chip reset vote is not active');
  }
  return freezeHandReady({
    ...state,
    ...refreshedDeadline(state, nowMs),
    chipResetVote: {
      ...vote,
      status: 'failed',
    },
  });
}

export function resetHandReadyAfterChipReset(
  state: HandReadyState,
  nowMs?: number,
): HandReadyState {
  const vote = activeChipResetVote(state);
  if (!vote) {
    throw new RangeError('Chip reset vote is not active');
  }
  return freezeHandReady({
    ...state,
    ...refreshedDeadline(state, nowMs),
    players: vote.players.map(({ playerId }) => ({
      playerId,
      choice: 'pending' as const,
    })),
    chipResetVote: null,
  });
}

export function removePlayerFromHandReady(
  state: HandReadyState,
  playerId: string,
): HandReadyState {
  const chipResetVote = state.chipResetVote
    ? {
        ...state.chipResetVote,
        players: state.chipResetVote.players.filter(
          (player) => player.playerId !== playerId,
        ),
        insufficientPlayerIds: state.chipResetVote.insufficientPlayerIds.filter(
          (candidate) => candidate !== playerId,
        ),
      }
    : null;
  const wasManualVote = state.chipResetVote?.insufficientPlayerIds.length === 0;
  return freezeHandReady({
    ...state,
    players: state.players.filter((player) => player.playerId !== playerId),
    chipResetVote:
      chipResetVote &&
      chipResetVote.players.length > 0 &&
      (chipResetVote.status === 'failed' ||
        wasManualVote ||
        chipResetVote.insufficientPlayerIds.length > 0)
        ? chipResetVote
        : null,
  });
}

export function addPlayerToHandReady(
  state: HandReadyState,
  playerId: string,
): HandReadyState {
  if (!playerId.trim()) throw new RangeError('Player id cannot be empty');
  if (state.players.some((player) => player.playerId === playerId)) {
    throw new RangeError(`Player is already in hand readiness: ${playerId}`);
  }
  return freezeHandReady({
    ...state,
    players: [...state.players, { playerId, choice: 'pending' }],
    chipResetVote: state.chipResetVote
      ? {
          ...state.chipResetVote,
          players: [
            ...state.chipResetVote.players,
            { playerId, vote: 'pending' },
          ],
        }
      : null,
  });
}

export function restorePlayerToHandReady(
  state: HandReadyState,
  playerId: string,
): HandReadyState {
  const existing = state.players.some((player) => player.playerId === playerId);
  return freezeHandReady({
    ...state,
    players: existing
      ? state.players.map((player) =>
          player.playerId === playerId
            ? { ...player, choice: 'sitting-out' }
            : player,
        )
      : [...state.players, { playerId, choice: 'sitting-out' }],
    chipResetVote: state.chipResetVote
      ? {
          ...state.chipResetVote,
          players: state.chipResetVote.players.some(
            ({ playerId: voterId }) => voterId === playerId,
          )
            ? state.chipResetVote.players
            : [...state.chipResetVote.players, { playerId, vote: 'pending' }],
        }
      : null,
  });
}
