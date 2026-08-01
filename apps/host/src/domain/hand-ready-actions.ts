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
  if (choice === 'ready' && roomPlayer.chips <= 0) {
    throw new RangeError('A zero-chip player cannot become ready');
  }
  return freezeHandReady({
    ...state,
    players: state.players.map((player) =>
      player.playerId === playerId ? { ...player, choice } : player,
    ),
  });
}

export function normalizeHandReadyAtDeadline(
  room: RoomState,
  state: HandReadyState,
  nowMs: number,
): HandReadyState {
  if (!Number.isSafeInteger(nowMs) || nowMs < state.deadlineMs) {
    throw new RangeError('Hand-ready deadline has not elapsed');
  }
  const chips = new Map(
    room.players.map((player) => [player.playerId, player.chips]),
  );
  return freezeHandReady({
    ...state,
    players: state.players.map((player) =>
      player.choice !== 'pending'
        ? player
        : {
            ...player,
            choice:
              (chips.get(player.playerId) ?? 0) > 0 ? 'ready' : 'sitting-out',
          },
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
