import type { HandRank } from '../evaluator/hand-rank.js';
import { eligibleSeatsClockwise, type Seat } from '../seating/seats.js';
import { selectPotWinners } from './distribution.js';
import type { Pot } from './pots.js';

export interface OddChipPotAward {
  readonly potIndex: number;
  readonly winnerIds: readonly string[];
  readonly equalShare: number;
  readonly oddChipWinnerIds: readonly string[];
  readonly refundedPlayerId?: string;
}

function unmatchedPotAward(pot: Pot, potIndex: number): OddChipPotAward | null {
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
    oddChipWinnerIds: Object.freeze([]),
    refundedPlayerId: playerId,
  });
}

export interface CompletePotDistribution {
  readonly payouts: Readonly<Record<string, number>>;
  readonly awards: readonly OddChipPotAward[];
}

function assertPotAwardConserves(pot: Pot, award: OddChipPotAward): void {
  const winnerPayout =
    award.equalShare * award.winnerIds.length + award.oddChipWinnerIds.length;
  const refund = award.refundedPlayerId ? award.equalShare : 0;
  if (
    (award.refundedPlayerId &&
      (award.winnerIds.length !== 0 || award.oddChipWinnerIds.length !== 0)) ||
    (!award.refundedPlayerId && award.winnerIds.length === 0) ||
    winnerPayout + refund !== pot.amount
  ) {
    throw new Error(
      `Pot ${award.potIndex} distribution did not conserve chips`,
    );
  }
}

export function distributePots(
  pots: readonly Pot[],
  ranks: Readonly<Record<string, HandRank>>,
  seats: readonly Seat[],
  buttonIndex: number,
): CompletePotDistribution {
  const payouts: Record<string, number> = {};
  const clockwise = eligibleSeatsClockwise(seats, buttonIndex).map(
    ({ playerId }) => playerId,
  );
  const awards = pots.map((pot, potIndex) => {
    const refund = unmatchedPotAward(pot, potIndex);
    if (refund) {
      const playerId = refund.refundedPlayerId!;
      payouts[playerId] = (payouts[playerId] ?? 0) + pot.amount;
      assertPotAwardConserves(pot, refund);
      return refund;
    }
    const winnerIds = selectPotWinners(pot, ranks);
    const winnerSet = new Set(winnerIds);
    const orderedWinners = clockwise.filter((playerId) =>
      winnerSet.has(playerId),
    );
    if (orderedWinners.length !== winnerIds.length) {
      throw new RangeError('Every pot winner must occupy an active seat');
    }

    const equalShare = Math.floor(pot.amount / winnerIds.length);
    const remainder = pot.amount % winnerIds.length;
    const oddChipWinnerIds = Object.freeze(orderedWinners.slice(0, remainder));
    for (const playerId of winnerIds) {
      payouts[playerId] = (payouts[playerId] ?? 0) + equalShare;
    }
    for (const playerId of oddChipWinnerIds) {
      payouts[playerId] = (payouts[playerId] ?? 0) + 1;
    }
    const award: OddChipPotAward = Object.freeze({
      potIndex,
      winnerIds,
      equalShare,
      oddChipWinnerIds,
    });
    assertPotAwardConserves(pot, award);
    return award;
  });

  const winnerPayouts = awards.reduce(
    (sum, award) =>
      sum +
      (award.refundedPlayerId
        ? 0
        : award.equalShare * award.winnerIds.length +
          award.oddChipWinnerIds.length),
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
