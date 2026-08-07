import { compareHandRanks } from '../evaluator/compare-hand-ranks.js';
import type { HandRank } from '../evaluator/hand-rank.js';
import type { Pot } from './pots.js';

export interface PotAward {
  readonly potIndex: number;
  readonly winnerIds: readonly string[];
  readonly equalShare: number;
  readonly refundedPlayerId?: string;
}

function unmatchedPotAward(pot: Pot, potIndex: number): PotAward | null {
  const playerId = pot.unmatchedPlayerId;
  if (!playerId) return null;
  if (
    pot.contributorIds.length !== 1 ||
    pot.contributorIds[0] !== playerId ||
    pot.eligiblePlayerIds.length > 1 ||
    (pot.eligiblePlayerIds.length === 1 &&
      pot.eligiblePlayerIds[0] !== playerId)
  ) {
    throw new RangeError('Invalid unmatched pot contributor');
  }
  return Object.freeze({
    potIndex,
    winnerIds: Object.freeze([]),
    equalShare: pot.amount,
    refundedPlayerId: playerId,
  });
}

export interface PotDistribution {
  readonly payouts: Readonly<Record<string, number>>;
  readonly awards: readonly PotAward[];
}

function assertPotAwardConserves(pot: Pot, award: PotAward): void {
  const winnerPayout = award.equalShare * award.winnerIds.length;
  const refund = award.refundedPlayerId ? award.equalShare : 0;
  if (
    (award.refundedPlayerId && award.winnerIds.length !== 0) ||
    (!award.refundedPlayerId && award.winnerIds.length === 0) ||
    winnerPayout + refund !== pot.amount
  ) {
    throw new Error(
      `Pot ${award.potIndex} distribution did not conserve chips`,
    );
  }
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
    const refund = unmatchedPotAward(pot, potIndex);
    if (refund) {
      const playerId = refund.refundedPlayerId!;
      payouts[playerId] = (payouts[playerId] ?? 0) + pot.amount;
      assertPotAwardConserves(pot, refund);
      return refund;
    }
    const winnerIds = selectPotWinners(pot, ranks);
    if (pot.amount % winnerIds.length !== 0) {
      throw new RangeError(`Pot ${potIndex} requires odd-chip distribution`);
    }
    const equalShare = pot.amount / winnerIds.length;
    for (const playerId of winnerIds) {
      payouts[playerId] = (payouts[playerId] ?? 0) + equalShare;
    }
    const award: PotAward = Object.freeze({
      potIndex,
      winnerIds,
      equalShare,
    });
    assertPotAwardConserves(pot, award);
    return award;
  });

  const winnerPayouts = awards.reduce(
    (sum, award) =>
      sum +
      (award.refundedPlayerId ? 0 : award.equalShare * award.winnerIds.length),
    0,
  );
  const unmatchedRefunds = awards.reduce(
    (sum, award) => sum + (award.refundedPlayerId ? award.equalShare : 0),
    0,
  );
  const totalLayers = pots.reduce((sum, pot) => sum + pot.amount, 0);
  if (winnerPayouts + unmatchedRefunds !== totalLayers) {
    throw new Error(
      `Pot settlement lost chips: ${winnerPayouts + unmatchedRefunds} of ${totalLayers}`,
    );
  }
  const distributed = Object.values(payouts).reduce(
    (sum, amount) => sum + amount,
    0,
  );
  if (distributed !== totalLayers) {
    throw new Error(
      `Pot distribution lost chips: ${distributed} of ${totalLayers}`,
    );
  }
  return Object.freeze({
    payouts: Object.freeze(payouts),
    awards: Object.freeze(awards),
  });
}
