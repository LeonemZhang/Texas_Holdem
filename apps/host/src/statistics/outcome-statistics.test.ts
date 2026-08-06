import { describe, expect, it } from 'vitest';

import type { HandSummaryEvent } from '@texas-holdem/poker-core';

import { reduceOutcomeStatistics } from './outcome-statistics.js';

function summary(
  handId: string,
  reason: 'showdown' | 'uncontested',
  winnerId: string,
  netChanges: Record<string, number>,
): HandSummaryEvent {
  return {
    type: 'hand.summary',
    handId,
    reason,
    buttonIndex: 0,
    participants: [
      { playerId: 'a', seatIndex: 0 },
      { playerId: 'b', seatIndex: 1 },
    ],
    communityCards: [],
    investments: { a: 10, b: 10 },
    pots: [{ amount: 20, winnerIds: [winnerId] }],
    winnerIds: [winnerId],
    payouts: { [winnerId]: 20 },
    netChanges,
    revealedHoleCards: {},
  };
}

describe('reduceOutcomeStatistics', () => {
  it('derives showdown rate, largest profit/loss, and uncontested wins from summaries', () => {
    const result = reduceOutcomeStatistics(
      ['a', 'b'],
      [
        summary('h1', 'showdown', 'a', { a: 10, b: -10 }),
        summary('h2', 'showdown', 'b', { a: -20, b: 20 }),
        summary('h3', 'uncontested', 'b', { a: -5, b: 5 }),
      ],
    );
    expect(result.a).toMatchObject({
      showdownCount: 2,
      showdownWins: 1,
      showdownWinRate: 0.5,
      largestSingleHandProfit: 10,
      largestSingleHandLoss: 20,
      uncontestedWins: 0,
    });
    expect(result.b).toMatchObject({
      showdownCount: 2,
      showdownWins: 1,
      showdownWinRate: 0.5,
      largestSingleHandProfit: 20,
      largestSingleHandLoss: 10,
      uncontestedWins: 1,
    });
  });

  it('uses null as the explicit no-showdown display value', () => {
    const result = reduceOutcomeStatistics(['a'], []);
    expect(result.a?.showdownWinRate).toBeNull();
  });
});
