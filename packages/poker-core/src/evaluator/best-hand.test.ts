import { describe, expect, it } from 'vitest';

import { formatCard, parseCard } from '../cards/card.js';
import { findBestFiveCardHand } from './best-hand.js';
import { HAND_CATEGORY } from './hand-rank.js';

function best(codes: readonly string[]) {
  return findBestFiveCardHand(codes.map(parseCard));
}

describe('findBestFiveCardHand', () => {
  it('finds the maximum rank among all 21 combinations', () => {
    const result = best(['As', 'Ah', 'Ad', 'Ac', 'Ks', 'Qh', '2d']);

    expect(result.rank).toEqual([HAND_CATEGORY.FOUR_OF_A_KIND, 14, 13]);
    expect(result.cards.map(formatCard)).toEqual([
      'As',
      'Ah',
      'Ad',
      'Ac',
      'Ks',
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.cards)).toBe(true);
  });

  it('allows all five community cards to form the best hand', () => {
    const result = best(['As', 'Kd', 'Qh', 'Jc', 'Ts', '2d', '3d']);

    expect(result.rank).toEqual([HAND_CATEGORY.STRAIGHT, 14]);
    expect(new Set(result.cards.map(formatCard))).toEqual(
      new Set(['As', 'Kd', 'Qh', 'Jc', 'Ts']),
    );
  });

  it('returns equal ranks when two players play the board', () => {
    const first = best(['As', 'Ks', 'Qs', 'Js', 'Ts', '2d', '3d']);
    const second = best(['As', 'Ks', 'Qs', 'Js', 'Ts', '4h', '5h']);

    expect(first.rank).toEqual(second.rank);
    expect(first.rank).toEqual([HAND_CATEGORY.STRAIGHT_FLUSH, 14]);
  });

  it('rejects duplicate cards and any count other than seven', () => {
    expect(() => best(['As', 'Ks', 'Qs', 'Js', 'Ts', '2d'])).toThrow(
      'Expected 7 cards, received 6',
    );
    expect(() => best(['As', 'As', 'Qs', 'Js', 'Ts', '2d', '3d'])).toThrow(
      'Duplicate card: As',
    );
  });
});
