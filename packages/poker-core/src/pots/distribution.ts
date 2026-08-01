import { compareHandRanks } from '../evaluator/compare-hand-ranks.js';
import type { HandRank } from '../evaluator/hand-rank.js';
import type { Pot } from './pots.js';

export interface PotAward {
  readonly potIndex: number;
  readonly winnerIds: readonly string[];
  readonly equalShare: number;
}

export interface PotDistribution {
  readonly payouts: Readonly<Record<string, number>>;
  readonly awards: readonly PotAward[];
}

export function selectPotWinners(
  pot: Pot,
  ranks: Readonly<Record<string, HandRank>>,
): readonly string[] {
  if (pot.eligiblePlayerIds.length === 0) {
    throw new RangeError('Pot has no eligible player');
  }
  const missing = pot.eligiblePlayerIds.find((playerId) => !ranks[playerId]);
  if (missing) throw new RangeError(`Missing hand rank for ${missing}`);

  let winners: string[] = [];
  for (const playerId of pot.eligiblePlayerIds) {
    if (winners.length === 0) {
      winners = [playerId];
      continue;
    }
    const comparison = compareHandRanks(ranks[playerId]!, ranks[winners[0]!]!);
    if (comparison > 0) winners = [playerId];
    else if (comparison === 0) winners.push(playerId);
  }
  return Object.freeze(winners);
}

export function distributeDivisiblePots(
  pots: readonly Pot[],
  ranks: Readonly<Record<string, HandRank>>,
): PotDistribution {
  const payouts: Record<string, number> = {};
  const awards = pots.map((pot, potIndex) => {
    const winnerIds = selectPotWinners(pot, ranks);
    if (pot.amount % winnerIds.length !== 0) {
      throw new RangeError(`Pot ${potIndex} requires odd-chip distribution`);
    }
    const equalShare = pot.amount / winnerIds.length;
    for (const playerId of winnerIds) {
      payouts[playerId] = (payouts[playerId] ?? 0) + equalShare;
    }
    return Object.freeze({ potIndex, winnerIds, equalShare });
  });

  const distributed = Object.values(payouts).reduce(
    (sum, amount) => sum + amount,
    0,
  );
  const total = pots.reduce((sum, pot) => sum + pot.amount, 0);
  if (distributed !== total) {
    throw new Error(`Pot distribution lost chips: ${distributed} of ${total}`);
  }
  return Object.freeze({
    payouts: Object.freeze(payouts),
    awards: Object.freeze(awards),
  });
}
