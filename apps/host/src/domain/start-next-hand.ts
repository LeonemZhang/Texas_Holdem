import {
  startHand,
  type RandomSource,
  type StartedHandState,
} from '@texas-holdem/poker-core';

import type { ChipRequestBook } from './chip-requests.js';
import { canBeginNextHand } from './hand-ready-actions.js';
import type { HandReadyState } from './hand-ready.js';
import { freezeRoom, type RoomState } from './room.js';

export interface NextHandStartedResult {
  readonly room: RoomState;
  readonly hand: StartedHandState;
}

export function startNextRoomHand(
  room: RoomState,
  handReady: HandReadyState,
  requests: ChipRequestBook,
  input: {
    readonly handId: string;
    readonly previousButtonIndex: number;
    readonly smallBlind: number;
    readonly randomSource: RandomSource;
    readonly allowPendingRequests?: boolean;
  },
): NextHandStartedResult {
  if (
    room.phase !== 'hand-ready' ||
    handReady.roomId !== room.roomId ||
    requests.afterHandId !== handReady.afterHandId
  ) {
    throw new RangeError('Room is not in this hand-ready phase');
  }
  const pendingRequests = requests.requests.filter(
    ({ status }) => status === 'pending',
  ).length;
  if (
    !canBeginNextHand(
      handReady,
      input.allowPendingRequests ? 0 : pendingRequests,
    )
  ) {
    throw new RangeError('Hand readiness is not complete');
  }
  const choices = new Map(
    handReady.players.map(({ playerId, choice }) => [playerId, choice]),
  );
  const participants = room.players
    .filter(
      ({ playerId, chips, status }) =>
        choices.get(playerId) === 'ready' &&
        chips >= room.settings.bigBlind &&
        !['left', 'removed', 'eliminated'].includes(status),
    )
    .map(({ playerId, seatIndex, chips: stack }) => ({
      playerId,
      seatIndex,
      stack,
    }));
  if (participants.length < 2) {
    throw new RangeError('At least two ready funded players are required');
  }
  const hand = startHand({
    handId: input.handId,
    participants,
    previousButtonIndex: input.previousButtonIndex,
    smallBlind: input.smallBlind,
    randomSource: input.randomSource,
  });
  const nextRoom = freezeRoom({
    ...room,
    phase: 'playing',
    players: room.players.map((player) => ({
      ...player,
      status: ['left', 'removed', 'eliminated'].includes(player.status)
        ? player.status
        : participants.some(({ playerId }) => playerId === player.playerId)
          ? 'active'
          : 'sitting-out',
    })),
    version: room.version + 1,
    voluntarilyRevealedHoleCardPlayerIds: [],
  });
  return Object.freeze({ room: nextRoom, hand });
}
