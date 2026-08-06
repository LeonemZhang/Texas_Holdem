import { HAND_CATEGORY, type HandSummaryEvent } from '@texas-holdem/poker-core';
import { describe, expect, it } from 'vitest';

import { reduceHandPeakStatistics } from './hand-peak-statistics.js';

const summary: HandSummaryEvent = {
  type: 'hand.summary',
  handId: 'hand-1',
  reason: 'showdown',
  buttonIndex: 0,
  participants: [
    { playerId: 'a', seatIndex: 0 },
    { playerId: 'b', seatIndex: 1 },
  ],
  communityCards: ['As', 'Ks', 'Qs', 'Js', 'Ts'],
  investments: {},
  pots: [],
  winnerIds: ['a'],
  payouts: {},
  netChanges: {},
  revealedHoleCards: {},
  evaluatedHands: {
    a: {
      rank: [HAND_CATEGORY.FLUSH, 14, 13, 12, 11, 9],
      bestFiveCards: ['As', 'Ks', 'Qs', 'Js', '9s'],
    },
    b: {
      rank: [HAND_CATEGORY.FLUSH, 14, 13, 12, 11, 8],
      bestFiveCards: ['As', 'Ks', 'Qs', 'Js', '8s'],
    },
  },
};

describe('reduceHandPeakStatistics', () => {
  it('selects the full rank winner and retains its five authoritative cards', () => {
    const result = reduceHandPeakStatistics(['a', 'b'], [summary]);
    expect(result.global).toMatchObject({
      playerIds: ['a'],
      bestFiveCards: ['As', 'Ks', 'Qs', 'Js', '9s'],
    });
    expect(result.players.b?.bestFiveCards).toEqual([
      'As',
      'Ks',
      'Qs',
      'Js',
      '8s',
    ]);
  });

  it('marks summaries without evaluated hands as legacy coverage gaps', () => {
    const { evaluatedHands: _evaluatedHands, ...legacy } = summary;
    expect(reduceHandPeakStatistics(['a'], [legacy]).hasLegacyCoverageGap).toBe(
      true,
    );
  });
});
