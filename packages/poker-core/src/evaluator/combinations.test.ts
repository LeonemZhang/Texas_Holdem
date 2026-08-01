import { describe, expect, it } from 'vitest';
import { formatCard, parseCard } from '../cards/card.js';
import { chooseFiveFromSeven } from './combinations.js';

const sevenCards = ['As', 'Kh', 'Qd', 'Jc', 'Ts', '9h', '8d'].map(parseCard);

function combinationKey(cards: readonly ReturnType<typeof parseCard>[]) {
  return cards.map(formatCard).sort().join('-');
}

describe('seven choose five', () => {
  it('returns exactly 21 unique immutable combinations', () => {
    const combinations = chooseFiveFromSeven(sevenCards);

    expect(combinations).toHaveLength(21);
    expect(new Set(combinations.map(combinationKey))).toHaveLength(21);
    expect(combinations.every((cards) => cards.length === 5)).toBe(true);
    expect(combinations.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(combinations)).toBe(true);
  });

  it('includes each original card in exactly 15 combinations', () => {
    const combinations = chooseFiveFromSeven(sevenCards);

    for (const card of sevenCards) {
      expect(
        combinations.filter((combination) => combination.includes(card)),
      ).toHaveLength(15);
    }
  });

  it('does not omit combinations when the input order is reversed', () => {
    const forwardKeys = new Set(
      chooseFiveFromSeven(sevenCards).map(combinationKey),
    );
    const reverseKeys = new Set(
      chooseFiveFromSeven([...sevenCards].reverse()).map(combinationKey),
    );

    expect(reverseKeys).toEqual(forwardKeys);
  });

  it('rejects wrong-sized or duplicate inputs', () => {
    expect(() => chooseFiveFromSeven(sevenCards.slice(0, 6))).toThrow(
      RangeError,
    );
    expect(() =>
      chooseFiveFromSeven([...sevenCards.slice(0, 6), sevenCards[0]!]),
    ).toThrow('Duplicate card');
  });
});
