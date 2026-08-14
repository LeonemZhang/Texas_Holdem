import {
  startHand,
  type RandomSource,
  type StartedHandState,
} from '@texas-holdem/poker-core';

import { canHostStartFirstHand } from './lobby-ready.js';
import { freezeRoom, isHostIdentity, type RoomState } from './room.js';

export interface FirstHandStartedResult {
  readonly room: RoomState;
  readonly hand: StartedHandState;
}

export function startFirstHand(
  room: RoomState,
  actorHostId: string,
  handId: string,
  randomSource: RandomSource,
): FirstHandStartedResult {
  if (room.firstHandStarted) {
    throw new RangeError('First hand was already started');
  }
  if (!isHostIdentity(room, actorHostId)) {
    throw new RangeError('Only the host can start the first hand');
  }
  if (!canHostStartFirstHand(room, actorHostId)) {
    throw new RangeError('First-hand start requirements are not satisfied');
  }
  const hand = startHand({
    handId,
    participants: room.players
      .filter(({ status }) => !['left', 'removed'].includes(status))
      .map(({ playerId, seatIndex, chips: stack }) => ({
        playerId,
        seatIndex,
        stack,
      })),
    previousButtonIndex: null,
    smallBlind: room.currentSmallBlind,
    randomSource,
  });
  const nextRoom = freezeRoom({
    ...room,
    phase: 'playing',
    firstHandStarted: true,
    players: room.players.map((player) => ({
      ...player,
      status: ['left', 'removed'].includes(player.status)
        ? player.status
        : 'active',
    })),
    version: room.version + 1,
    voluntarilyRevealedHoleCardPlayerIds: [],
  });
  return Object.freeze({ room: nextRoom, hand });
}
