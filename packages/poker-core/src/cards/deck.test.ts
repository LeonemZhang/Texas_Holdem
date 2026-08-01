import { describe, expect, it } from 'vitest';
import { createCard, formatCard, parseCard } from './card.js';
import {
  DuplicateCardError,
  assertUniqueCards,
  createStandardDeck,
} from './deck.js';

describe('standard deck', () => {
  it('contains exactly 52 unique immutable cards', () => {
    const deck = createStandardDeck();
    const codes = deck.map(formatCard);

    expect(deck).toHaveLength(52);
    expect(new Set(codes)).toHaveLength(52);
    expect(Object.isFrozen(deck)).toBe(true);
    expect(deck.every(Object.isFrozen)).toBe(true);
    expect(codes).toContain('2c');
    expect(codes).toContain('As');
  });

  it('accepts an arbitrary unique card collection', () => {
    expect(() =>
      assertUniqueCards([parseCard('As'), parseCard('Kh')]),
    ).not.toThrow();
  });

  it('rejects duplicate encodings even when objects differ', () => {
    expect(() =>
      assertUniqueCards([parseCard('As'), createCard('A', 's')]),
    ).toThrow(new DuplicateCardError('As'));
  });
});
