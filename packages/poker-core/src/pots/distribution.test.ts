import { describe, expect, it } from 'vitest';

import { HAND_CATEGORY, type HandRank } from '../evaluator/hand-rank.js';
import { distributeDivisiblePots } from './distribution.js';

describe('distributeDivisiblePots', () => {
  it('selects a winner independently from each pot eligibility set', () => {
    const ranks: Record<string, HandRank> = {
      a: [HAND_CATEGORY.ONE_PAIR, 14, 10, 9, 8],
      b: [HAND_CATEGORY.TWO_PAIR, 8, 7, 14],
    };
    const result = distributeDivisiblePots(
      [
        {
          amount: 150,
          contributorIds: ['a', 'b', 'c'],
          eligiblePlayerIds: ['a', 'b'],
        },
        { amount: 100, contributorIds: ['a', 'c'], eligiblePlayerIds: ['a'] },
      ],
      ranks,
    );
    expect(result.payouts).toEqual({ b: 150, a: 100 });
  });

  it('splits a divisible tie while conserving every chip', () => {
    const tie: HandRank = [HAND_CATEGORY.STRAIGHT, 10];
    const result = distributeDivisiblePots(
      [
        {
          amount: 100,
          contributorIds: ['a', 'b'],
          eligiblePlayerIds: ['a', 'b'],
        },
      ],
      { a: tie, b: tie },
    );
    expect(result.payouts).toEqual({ a: 50, b: 50 });
    expect(
      Object.values(result.payouts).reduce((sum, amount) => sum + amount, 0),
    ).toBe(100);
  });

  it('leaves non-divisible pots for the odd-chip rule', () => {
    const tie: HandRank = [HAND_CATEGORY.FLUSH, 14, 12, 8, 4, 2];
    expect(() =>
      distributeDivisiblePots(
        [
          {
            amount: 5,
            contributorIds: ['a', 'b'],
            eligiblePlayerIds: ['a', 'b'],
          },
        ],
        { a: tie, b: tie },
      ),
    ).toThrow('Pot 0 requires odd-chip distribution');
  });
});
