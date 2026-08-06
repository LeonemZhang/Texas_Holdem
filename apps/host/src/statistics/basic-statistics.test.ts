import { describe, expect, it } from 'vitest';

import type { HandSummaryEvent } from '@texas-holdem/poker-core';

import {
  reduceBasicStatistics,
  type BasicStatisticsEvent,
} from './basic-statistics.js';

const summary: HandSummaryEvent = {
  type: 'hand.summary',
  handId: 'h1',
  reason: 'uncontested',
  buttonIndex: 0,
  participants: [
    { playerId: 'a', seatIndex: 0 },
    { playerId: 'b', seatIndex: 1 },
  ],
  communityCards: [],
  investments: { a: 10, b: 20 },
  pots: [{ amount: 30, winnerIds: ['b'] }],
  winnerIds: ['b'],
  payouts: { b: 30 },
  netChanges: { a: -10, b: 10 },
  revealedHoleCards: {},
};

describe('reduceBasicStatistics', () => {
  const events: readonly BasicStatisticsEvent[] = [
    {
      type: 'player.action',
      handId: 'h1',
      playerId: 'a',
      action: 'fold',
      street: 'preflop',
    },
    {
      type: 'player.action',
      handId: 'h1',
      playerId: 'b',
      action: 'raiseTo',
      street: 'preflop',
    },
    summary,
  ];

  it('derives chips, hands, wins, and actions from confirmed events', () => {
    const result = reduceBasicStatistics({ a: 100, b: 100 }, events);
    expect(result.a).toMatchObject({
      currentChips: 90,
      netWinLoss: -10,
      participatedHands: 1,
      wonHands: 0,
      actionCounts: { fold: 1 },
      preflopFoldCount: 1,
    });
    expect(result.b).toMatchObject({
      currentChips: 110,
      netWinLoss: 10,
      participatedHands: 1,
      wonHands: 1,
      actionCounts: { raiseTo: 1 },
      totalWonPotChips: 30,
    });
  });

  it('keeps net win or loss limited to hand settlements', () => {
    const result = reduceBasicStatistics({ a: 1_000, b: 1_000 }, [
      {
        ...summary,
        netChanges: { a: -500, b: 500 },
      },
    ]);

    // Chip requests and direct transfers are not BasicStatisticsEvent inputs.
    expect(result.b!.netWinLoss).toBe(500);
    expect(result.b!.currentChips).toBe(1_500);
  });

  it('replays the same event stream to exactly the same immutable result', () => {
    const first = reduceBasicStatistics({ a: 100, b: 100 }, events);
    const second = reduceBasicStatistics({ a: 100, b: 100 }, events);
    expect(first).toEqual(second);
    expect(Object.isFrozen(first.a)).toBe(true);
  });

  it('rejects events for players outside the authoritative roster', () => {
    expect(() =>
      reduceBasicStatistics({ a: 100 }, [
        {
          type: 'player.action',
          handId: 'h1',
          playerId: 'client-injected',
          action: 'allIn',
          street: 'preflop',
        },
      ]),
    ).toThrow('Statistics player not found: client-injected');
  });
});
