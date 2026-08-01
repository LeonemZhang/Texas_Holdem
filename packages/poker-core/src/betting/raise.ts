import {
  assertChipAmount,
  freezeBettingState,
  pendingClockwiseAfter,
  requireCurrentActor,
  type BettingRoundState,
} from './state.js';
import { assertRaiseReopenedFor } from './reopen.js';

export function applyRaiseTo(
  state: BettingRoundState,
  playerId: string,
  amount: number,
): BettingRoundState {
  const actor = requireCurrentActor(state, playerId);
  assertRaiseReopenedFor(state, actor);
  assertChipAmount(amount, 'Raise target');
  if (amount <= state.currentBet) {
    throw new RangeError('Raise target must exceed the current bet');
  }
  const increment = amount - state.currentBet;
  if (increment < state.minimumRaiseIncrement) {
    throw new RangeError('Raise target is below the minimum raise');
  }
  const paid = amount - actor.streetCommitted;
  if (paid > actor.stack) {
    throw new RangeError('Raise target exceeds player stack');
  }

  const players = state.players.map((player) =>
    player.playerId === playerId
      ? {
          ...player,
          stack: player.stack - paid,
          streetCommitted: amount,
          totalCommitted: player.totalCommitted + paid,
          status: paid === player.stack ? ('all-in' as const) : player.status,
          actedAtBet: amount,
        }
      : player,
  );
  const pending = new Set(
    players
      .filter(
        (player) =>
          player.playerId !== playerId &&
          player.status === 'active' &&
          player.streetCommitted < amount,
      )
      .map(({ playerId: id }) => id),
  );
  const orderedPending = pendingClockwiseAfter(players, pending, playerId);
  return freezeBettingState({
    players,
    currentBet: amount,
    minimumRaiseIncrement: increment,
    currentActorId: orderedPending[0] ?? null,
    pendingPlayerIds: orderedPending,
  });
}
