import { isBettingRoundComplete } from '../betting/betting-round.js';
import type { Card } from '../cards/card.js';
import type { StartedHandState } from './start-hand.js';

export interface HandSettlementBase {
  readonly winnerIds: readonly string[];
  readonly payouts: Readonly<Record<string, number>>;
  readonly revealedHoleCards: Readonly<Record<string, readonly Card[]>>;
}

export interface UncontestedSettlement extends HandSettlementBase {
  readonly reason: 'uncontested';
}

export interface UncontestedSettledHand extends StartedHandState {
  readonly settlement: UncontestedSettlement;
}

export function settleUncontestedHand(
  state: StartedHandState,
): UncontestedSettledHand {
  if (!isBettingRoundComplete(state.betting)) {
    throw new RangeError('Betting round is not complete');
  }
  const contenders = state.players.filter(({ status }) => status !== 'folded');
  if (contenders.length !== 1) {
    throw new RangeError(
      `Uncontested settlement requires one contender, received ${contenders.length}`,
    );
  }
  const winner = contenders[0]!;
  const pot = state.players.reduce(
    (sum, player) => sum + player.totalCommitted,
    0,
  );
  const players = state.players.map((player) =>
    Object.freeze({
      ...player,
      stack: player.stack + (player.playerId === winner.playerId ? pot : 0),
    }),
  );
  const settlement = Object.freeze({
    reason: 'uncontested' as const,
    winnerIds: Object.freeze([winner.playerId]),
    payouts: Object.freeze({ [winner.playerId]: pot }),
    revealedHoleCards: Object.freeze({}),
  });
  return Object.freeze({
    ...state,
    players: Object.freeze(players),
    settlement,
  });
}
