import {
  freezeBettingState,
  pendingClockwiseAfter,
  requireCurrentActor,
  type BettingRoundState,
} from './state.js';
import { assertRaiseReopenedFor } from './reopen.js';

export function applyAllIn(
  state: BettingRoundState,
  playerId: string,
): BettingRoundState {
  const actor = requireCurrentActor(state, playerId);
  if (actor.stack === 0) {
    throw new RangeError('Player has no chips to move all-in');
  }
  const target = actor.streetCommitted + actor.stack;
  const raisesCurrentBet = target > state.currentBet;
  if (raisesCurrentBet) {
    assertRaiseReopenedFor(state, actor);
  }
  const increment = target - state.currentBet;
  const isFullRaise =
    raisesCurrentBet && increment >= state.minimumRaiseIncrement;
  const nextBet = raisesCurrentBet ? target : state.currentBet;

  const players = state.players.map((player) =>
    player.playerId === playerId
      ? {
          ...player,
          stack: 0,
          streetCommitted: target,
          totalCommitted: player.totalCommitted + player.stack,
          status: 'all-in' as const,
          actedAtBet: raisesCurrentBet ? target : state.currentBet,
        }
      : player,
  );
  let pending = new Set(state.pendingPlayerIds.filter((id) => id !== playerId));
  if (raisesCurrentBet) {
    pending = new Set(
      players
        .filter(
          (player) =>
            player.playerId !== playerId &&
            player.status === 'active' &&
            player.streetCommitted < target,
        )
        .map(({ playerId: id }) => id),
    );
  }
  const orderedPending = pendingClockwiseAfter(players, pending, playerId);
  return freezeBettingState({
    players,
    currentBet: nextBet,
    minimumRaiseIncrement: isFullRaise
      ? increment
      : state.minimumRaiseIncrement,
    currentActorId: orderedPending[0] ?? null,
    pendingPlayerIds: orderedPending,
  });
}
