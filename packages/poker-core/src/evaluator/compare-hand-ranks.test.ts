import { describe, expect, it } from 'vitest';

import { compareHandRanks } from './compare-hand-ranks.js';
import { HAND_CATEGORY, type HandRank } from './hand-rank.js';

describe('compareHandRanks', () => {
  it('compares different categories before their kickers', () => {
    const pair = [HAND_CATEGORY.ONE_PAIR, 2, 14, 13, 12] as HandRank;
    const highCard = [HAND_CATEGORY.HIGH_CARD, 14, 13, 12, 11, 9] as HandRank;

    expect(compareHandRanks(pair, highCard)).toBe(1);
    expect(compareHandRanks(highCard, pair)).toBe(-1);
  });

  it('compares every same-category tiebreaker in order', () => {
    const kingKicker = [HAND_CATEGORY.TWO_PAIR, 14, 12, 13] as HandRank;
    const jackKicker = [HAND_CATEGORY.TWO_PAIR, 14, 12, 11] as HandRank;

    expect(compareHandRanks(kingKicker, jackKicker)).toBe(1);
  });

  it('recognizes an exact poker tie', () => {
    const left = [HAND_CATEGORY.FLUSH, 14, 10, 8, 5, 2] as HandRank;
    const right = [HAND_CATEGORY.FLUSH, 14, 10, 8, 5, 2] as HandRank;

    expect(compareHandRanks(left, right)).toBe(0);
  });

  it('does not mutate either rank', () => {
    const left = Object.freeze([HAND_CATEGORY.STRAIGHT, 5]) as HandRank;
    const right = Object.freeze([HAND_CATEGORY.STRAIGHT, 6]) as HandRank;

    compareHandRanks(left, right);
    expect(left).toEqual([HAND_CATEGORY.STRAIGHT, 5]);
    expect(right).toEqual([HAND_CATEGORY.STRAIGHT, 6]);
  });
});
