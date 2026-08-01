import { describe, expect, it } from 'vitest';

import { HAND_CATEGORY, type HandRank } from '../evaluator/hand-rank.js';
import type { Seat } from '../seating/seats.js';
import { distributePots } from './odd-chips.js';

const seats: readonly Seat[] = [
  { index: 0, playerId: 'a', status: 'active' },
  { index: 2, playerId: 'b', status: 'active' },
  { index: 5, playerId: 'c', status: 'active' },
];

describe('distributePots with odd chips', () => {
  it('awards each remainder chip clockwise from the button left', () => {
    const tie: HandRank = [HAND_CATEGORY.FLUSH, 14, 12, 8, 4, 2];
    const result = distributePots(
      [
        {
          amount: 5,
          contributorIds: ['a', 'b'],
          eligiblePlayerIds: ['a', 'b'],
        },
      ],
      { a: tie, b: tie },
      seats,
      0,
    );
    expect(result.payouts).toEqual({ a: 2, b: 3 });
    expect(result.awards[0]?.oddChipWinnerIds).toEqual(['b']);
  });

  it('restarts the same clockwise rule independently for multiple pots', () => {
    const tie: HandRank = [HAND_CATEGORY.STRAIGHT, 9];
    const result = distributePots(
      [
        {
          amount: 5,
          contributorIds: ['a', 'b'],
          eligiblePlayerIds: ['a', 'b'],
        },
        {
          amount: 3,
          contributorIds: ['a', 'b'],
          eligiblePlayerIds: ['a', 'b'],
        },
      ],
      { a: tie, b: tie },
      seats,
      0,
    );
    expect(result.payouts).toEqual({ a: 3, b: 5 });
    expect(
      result.awards.map(({ oddChipWinnerIds }) => oddChipWinnerIds),
    ).toEqual([['b'], ['b']]);
    expect(
      Object.values(result.payouts).reduce((sum, amount) => sum + amount, 0),
    ).toBe(8);
  });
});
