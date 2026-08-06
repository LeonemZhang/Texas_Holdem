import type { Card } from '../cards/card.js';
import { assertUniqueCards } from '../cards/deck.js';

export function chooseFiveFrom(
  cards: readonly Card[],
): readonly (readonly Card[])[] {
  if (cards.length < 5) {
    throw new RangeError(`Expected at least 5 cards, received ${cards.length}`);
  }
  assertUniqueCards(cards);

  const combinations: (readonly Card[])[] = [];
  const select = (start: number, selected: readonly Card[]): void => {
    if (selected.length === 5) {
      combinations.push(Object.freeze([...selected]));
      return;
    }
    const remaining = 5 - selected.length;
    for (let index = start; index <= cards.length - remaining; index += 1) {
      const card = cards[index];
      if (!card) {
        throw new RangeError('Combination index moved outside the cards');
      }
      select(index + 1, [...selected, card]);
    }
  };
  select(0, []);

  return Object.freeze(combinations);
}

export function chooseFiveFromSeven(
  cards: readonly Card[],
): readonly (readonly Card[])[] {
  if (cards.length !== 7) {
    throw new RangeError(`Expected 7 cards, received ${cards.length}`);
  }
  return chooseFiveFrom(cards);
}
