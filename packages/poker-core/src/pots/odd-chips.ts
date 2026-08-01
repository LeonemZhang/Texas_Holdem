import type { HandRank } from '../evaluator/hand-rank.js';
import { eligibleSeatsClockwise, type Seat } from '../seating/seats.js';
import { selectPotWinners } from './distribution.js';
import type { Pot } from './pots.js';

export interface OddChipPotAward {
  readonly potIndex: number;
  readonly winnerIds: readonly string[];
  readonly equalShare: number;
  readonly oddChipWinnerIds: readonly string[];
}

export interface CompletePotDistribution {
  readonly payouts: Readonly<Record<string, number>>;
  readonly awards: readonly OddChipPotAward[];
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
    return Object.freeze({
      potIndex,
      winnerIds,
      equalShare,
      oddChipWinnerIds,
    });
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
