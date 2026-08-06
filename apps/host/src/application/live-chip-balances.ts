import type { StartedHandState } from '@texas-holdem/poker-core';

import { freezeRoom, type RoomState } from '../domain/room.js';

/** Mirrors poker-core's live stacks into the room snapshot authority. */
export function syncLiveChipBalances(
  room: RoomState,
  hand: StartedHandState,
): RoomState {
  const stacks = new Map(
    hand.players.map(({ playerId, stack }) => [playerId, stack]),
  );
  return freezeRoom({
    ...room,
    players: room.players.map((player) => ({
      ...player,
      chips: stacks.get(player.playerId) ?? player.chips,
    })),
  });
}
