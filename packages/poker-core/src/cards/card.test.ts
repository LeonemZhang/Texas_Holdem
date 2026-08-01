import { describe, expect, it } from 'vitest';
import {
  RANKS,
  SUITS,
  cardsEqual,
  createCard,
  formatCard,
  parseCard,
  type CardCode,
} from './card.js';

describe('card encoding', () => {
  it('round-trips all 52 canonical card codes', () => {
    const codes = RANKS.flatMap((rank) =>
      SUITS.map((suit) => `${rank}${suit}` as CardCode),
    );

    expect(codes).toHaveLength(52);
    expect(new Set(codes)).toHaveLength(52);

    for (const code of codes) {
      const card = parseCard(code);
      expect(formatCard(card)).toBe(code);
      expect(Object.isFrozen(card)).toBe(true);
    }
  });

  it.each(['', 'A', '10s', 'as', 'AX', '1c', 'Thh', ' T'])(
    'rejects invalid code %j',
    (code) => {
      expect(() => parseCard(code)).toThrow(RangeError);
    },
  );

  it('compares cards by rank and suit', () => {
    expect(cardsEqual(createCard('A', 's'), parseCard('As'))).toBe(true);
    expect(cardsEqual(createCard('A', 's'), createCard('A', 'h'))).toBe(false);
  });
});
