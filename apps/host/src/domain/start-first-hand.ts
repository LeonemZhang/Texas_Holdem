import {
  startHand,
  type RandomSource,
  type StartedHandState,
} from '@texas-holdem/poker-core';

import { canHostStartFirstHand } from './lobby-ready.js';
import { freezeRoom, type RoomState } from './room.js';

export interface FirstHandStartedResult {
  readonly room: RoomState;
  readonly hand: StartedHandState;
}

export function startFirstHand(
  room: RoomState,
  actorPlayerId: string,
  handId: string,
  randomSource: RandomSource,
): FirstHandStartedResult {
  if (room.firstHandStarted) {
    throw new RangeError('First hand was already started');
  }
  if (actorPlayerId !== room.hostPlayerId) {
    throw new RangeError('Only the host can start the first hand');
  }
  if (!canHostStartFirstHand(room, actorPlayerId)) {
    throw new RangeError('First-hand start requirements are not satisfied');
  }
  const hand = startHand({
    handId,
    participants: room.players
      .filter(({ status }) => status !== 'left')
      .map(({ playerId, seatIndex, chips: stack }) => ({
        playerId,
        seatIndex,
        stack,
      })),
    previousButtonIndex: null,
    smallBlind: room.settings.smallBlind,
    randomSource,
  });
  const nextRoom = freezeRoom({
    ...room,
    phase: 'playing',
    firstHandStarted: true,
    players: room.players.map((player) => ({
      ...player,
      status: player.status === 'left' ? 'left' : 'active',
    })),
    version: room.version + 1,
  });
  return Object.freeze({ room: nextRoom, hand });
}
