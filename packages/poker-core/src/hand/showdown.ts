import { isBettingRoundComplete } from '../betting/betting-round.js';
import {
  findBestFiveCardHand,
  type BestFiveCardHand,
} from '../evaluator/best-hand.js';
import { buildPots, type Pot } from '../pots/pots.js';
import { distributePots, type OddChipPotAward } from '../pots/odd-chips.js';
import type { Seat } from '../seating/seats.js';
import type { HandSettlementBase } from './uncontested.js';
import type { StartedHandState } from './start-hand.js';

export interface ShowdownSettlement extends HandSettlementBase {
  readonly reason: 'showdown';
  readonly pots: readonly Pot[];
  readonly awards: readonly OddChipPotAward[];
  readonly bestHands: Readonly<Record<string, BestFiveCardHand>>;
}

export interface ShowdownSettledHand extends StartedHandState {
  readonly settlement: ShowdownSettlement;
}

export function settleShowdown(state: StartedHandState): ShowdownSettledHand {
  if (state.street !== 'river' || state.communityCards.length !== 5) {
    throw new RangeError('Showdown requires all five community cards');
  }
  if (!isBettingRoundComplete(state.betting)) {
    throw new RangeError('River betting round is not complete');
  }
  const contenders = state.players.filter(({ status }) => status !== 'folded');
  if (contenders.length < 2) {
    throw new RangeError('Showdown requires at least two contenders');
  }

  const bestHands: Record<string, BestFiveCardHand> = {};
  const ranks = Object.fromEntries(
    contenders.map((player) => {
      const best = findBestFiveCardHand([
        ...player.holeCards,
        ...state.communityCards,
      ]);
      bestHands[player.playerId] = best;
      return [player.playerId, best.rank];
    }),
  );
  const pots = buildPots(
    state.players.map((player) => ({
      playerId: player.playerId,
      amount: player.totalCommitted,
      folded: player.status === 'folded',
    })),
  );
  const seats: readonly Seat[] = state.players.map((player) => ({
    index: player.seatIndex,
    playerId: player.playerId,
    status: player.status === 'folded' ? 'sitting-out' : 'active',
  }));
  const distribution = distributePots(
    pots,
    ranks,
    seats,
    state.positions.button.index,
  );
  const players = state.players.map((player) =>
    Object.freeze({
      ...player,
      stack: player.stack + (distribution.payouts[player.playerId] ?? 0),
    }),
  );
  const winnerIds = Object.freeze([
    ...new Set(distribution.awards.flatMap(({ winnerIds: ids }) => ids)),
  ]);
  const revealedHoleCards = Object.freeze(
    Object.fromEntries(
      contenders.map((player) => [player.playerId, player.holeCards]),
    ),
  );
  const settlement = Object.freeze({
    reason: 'showdown' as const,
    winnerIds,
    payouts: distribution.payouts,
    revealedHoleCards,
    pots,
    awards: distribution.awards,
    bestHands: Object.freeze(bestHands),
  });

  const before = state.players.reduce(
    (sum, player) => sum + player.stack + player.totalCommitted,
    0,
  );
  const after = players.reduce((sum, player) => sum + player.stack, 0);
  if (before !== after) {
    throw new Error(`Showdown lost chips: ${after} of ${before}`);
  }
  return Object.freeze({
    ...state,
    players: Object.freeze(players),
    settlement,
  });
}
