import { describe, expect, it } from 'vitest';
import { formatCard, parseCard } from './card.js';
import { createStandardDeck } from './deck.js';
import { shuffleCards, type RandomSource } from './shuffle.js';

class SequenceRandomSource implements RandomSource {
  readonly #values: readonly number[];
  #index = 0;

  constructor(values: readonly number[]) {
    this.#values = values;
  }

  next(): number {
    const value = this.#values[this.#index];
    if (value === undefined) {
      throw new Error('Random test sequence exhausted');
    }
    this.#index += 1;
    return value;
  }
}

describe('Fisher-Yates shuffle', () => {
  it('produces a deterministic order from an injected source', () => {
    const cards = ['As', 'Kh', 'Qd', 'Jc'].map(parseCard);
    const random = new SequenceRandomSource([0, 0, 0]);

    expect(shuffleCards(cards, random).map(formatCard)).toEqual([
      'Kh',
      'Qd',
      'Jc',
      'As',
    ]);
  });

  it('does not mutate the input and preserves the exact card set', () => {
    const deck = createStandardDeck();
    const originalCodes = deck.map(formatCard);
    const random = new SequenceRandomSource(
      Array.from(
        { length: deck.length - 1 },
        (_, index) => ((index * 17) % 97) / 97,
      ),
    );

    const shuffled = shuffleCards(deck, random);

    expect(deck.map(formatCard)).toEqual(originalCodes);
    expect(new Set(shuffled.map(formatCard))).toEqual(new Set(originalCodes));
    expect(Object.isFrozen(shuffled)).toBe(true);
  });

  it.each([-0.01, 1, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid random value %s',
    (value) => {
      expect(() =>
        shuffleCards(
          [parseCard('As'), parseCard('Kh')],
          new SequenceRandomSource([value]),
        ),
      ).toThrow(RangeError);
    },
  );
});
