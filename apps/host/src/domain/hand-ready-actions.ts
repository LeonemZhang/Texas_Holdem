import type { RoomState } from './room.js';
import type { HandReadyChoice, HandReadyState } from './hand-ready.js';

function freezeHandReady(state: HandReadyState): HandReadyState {
  return Object.freeze({
    ...state,
    players: Object.freeze(
      state.players.map((player) => Object.freeze({ ...player })),
    ),
  });
}

export function setHandReadyChoice(
  room: RoomState,
  state: HandReadyState,
  playerId: string,
  choice: Exclude<HandReadyChoice, 'pending'>,
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
  if (choice === 'ready' && roomPlayer.chips < room.settings.bigBlind) {
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
    state.players.every(({ choice }) => choice !== 'pending')
  );
}

export function removePlayerFromHandReady(
  state: HandReadyState,
  playerId: string,
): HandReadyState {
  return freezeHandReady({
    ...state,
    players: state.players.filter((player) => player.playerId !== playerId),
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
  });
}
