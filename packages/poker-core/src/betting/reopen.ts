import type { BettingPlayer, BettingRoundState } from './state.js';

export function isRaiseReopenedFor(
  state: BettingRoundState,
  player: BettingPlayer,
): boolean {
  return (
    player.actedAtBet === null ||
    state.currentBet - player.actedAtBet >= state.minimumRaiseIncrement
  );
}

export function assertRaiseReopenedFor(
  state: BettingRoundState,
  player: BettingPlayer,
): void {
  if (!isRaiseReopenedFor(state, player)) {
    throw new RangeError('Raising is not reopened');
  }
}
