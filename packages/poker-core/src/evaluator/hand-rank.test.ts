import { describe, expect, it } from 'vitest';

import { parseCard } from '../cards/card.js';
import { HAND_CATEGORY, rankFiveCards } from './hand-rank.js';

function rank(codes: readonly string[]) {
  return rankFiveCards(codes.map(parseCard));
}

describe('rankFiveCards', () => {
  it.each([
    [
      'high card',
      ['As', 'Kd', '9c', '6h', '3s'],
      [HAND_CATEGORY.HIGH_CARD, 14, 13, 9, 6, 3],
    ],
    [
      'one pair',
      ['As', 'Ad', 'Kc', '9h', '3s'],
      [HAND_CATEGORY.ONE_PAIR, 14, 13, 9, 3],
    ],
    [
      'two pair',
      ['As', 'Ad', 'Kc', 'Kh', '3s'],
      [HAND_CATEGORY.TWO_PAIR, 14, 13, 3],
    ],
    [
      'three of a kind',
      ['As', 'Ad', 'Ac', 'Kh', '3s'],
      [HAND_CATEGORY.THREE_OF_A_KIND, 14, 13, 3],
    ],
    ['straight', ['9s', 'Td', 'Jc', 'Qh', 'Ks'], [HAND_CATEGORY.STRAIGHT, 13]],
    [
      'flush',
      ['As', 'Ks', '9s', '6s', '3s'],
      [HAND_CATEGORY.FLUSH, 14, 13, 9, 6, 3],
    ],
    [
      'full house',
      ['As', 'Ad', 'Ac', 'Kh', 'Ks'],
      [HAND_CATEGORY.FULL_HOUSE, 14, 13],
    ],
    [
      'four of a kind',
      ['As', 'Ad', 'Ac', 'Ah', 'Ks'],
      [HAND_CATEGORY.FOUR_OF_A_KIND, 14, 13],
    ],
    [
      'straight flush',
      ['9s', 'Ts', 'Js', 'Qs', 'Ks'],
      [HAND_CATEGORY.STRAIGHT_FLUSH, 13],
    ],
  ] as const)('creates the complete tuple for %s', (_name, codes, expected) => {
    const result = rank(codes);

    expect(result).toEqual(expected);
    expect(Object.isFrozen(result)).toBe(true);
  });

  it('uses five as the high card for a wheel straight flush', () => {
    expect(rank(['As', '2s', '3s', '4s', '5s'])).toEqual([
      HAND_CATEGORY.STRAIGHT_FLUSH,
      5,
    ]);
  });

  it('orders both pairs before the kicker regardless of input order', () => {
    expect(rank(['2s', 'Ad', '2c', 'Kh', 'As'])).toEqual([
      HAND_CATEGORY.TWO_PAIR,
      14,
      2,
      13,
    ]);
  });
});
