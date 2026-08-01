import { describe, expect, it } from 'vitest';

import { parseCard } from '../cards/card.js';
import { DuplicateCardError } from '../cards/deck.js';
import { analyzeFiveCards } from './five-card-analysis.js';

function cards(codes: readonly string[]) {
  return codes.map(parseCard);
}

describe('analyzeFiveCards', () => {
  it('counts and orders rank groups by frequency and value', () => {
    const result = analyzeFiveCards(cards(['As', 'Ah', 'Ad', 'Kc', 'Kd']));

    expect(result.rankGroups).toEqual([
      { rank: 'A', value: 14, count: 3 },
      { rank: 'K', value: 13, count: 2 },
    ]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.rankGroups)).toBe(true);
    expect(result.rankGroups.every(Object.isFrozen)).toBe(true);
  });

  it('detects a flush independently from its ranks', () => {
    expect(
      analyzeFiveCards(cards(['2h', '5h', '8h', 'Jh', 'Ah'])).isFlush,
    ).toBe(true);
    expect(
      analyzeFiveCards(cards(['2h', '5h', '8h', 'Jh', 'As'])).isFlush,
    ).toBe(false);
  });

  it.each([
    [['9c', 'Td', 'Jh', 'Qs', 'Kc'], 13],
    [['Tc', 'Jd', 'Qh', 'Ks', 'Ac'], 14],
    [['Ac', '2d', '3h', '4s', '5c'], 5],
  ] as const)('detects %s as a straight with high card %s', (codes, high) => {
    expect(analyzeFiveCards(cards(codes)).straightHigh).toBe(high);
  });

  it.each([
    ['a gap', ['2c', '3d', '4h', '6s', '7c']],
    ['a duplicate rank', ['2c', '2d', '3h', '4s', '5c']],
    ['an ace used in the middle', ['Qc', 'Kd', 'Ah', '2s', '3c']],
  ])('does not mistake %s for a straight', (_name, codes) => {
    expect(analyzeFiveCards(cards(codes)).straightHigh).toBeNull();
  });

  it('rejects a card count other than five', () => {
    expect(() => analyzeFiveCards(cards(['As', 'Kh', 'Qd', 'Jc']))).toThrow(
      'Expected 5 cards, received 4',
    );
  });

  it('rejects a duplicate physical card', () => {
    expect(() =>
      analyzeFiveCards(cards(['As', 'As', 'Qd', 'Jc', 'Th'])),
    ).toThrow(DuplicateCardError);
  });
});
