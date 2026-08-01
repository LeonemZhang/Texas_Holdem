import type { Card } from '../cards/card.js';
import { assertUniqueCards } from '../cards/deck.js';

export function chooseFiveFromSeven(
  cards: readonly Card[],
): readonly (readonly Card[])[] {
  if (cards.length !== 7) {
    throw new RangeError(`Expected 7 cards, received ${cards.length}`);
  }
  assertUniqueCards(cards);

  const combinations: (readonly Card[])[] = [];
  for (let first = 0; first < 3; first += 1) {
    for (let second = first + 1; second < 4; second += 1) {
      for (let third = second + 1; third < 5; third += 1) {
        for (let fourth = third + 1; fourth < 6; fourth += 1) {
          for (let fifth = fourth + 1; fifth < 7; fifth += 1) {
            const combination = [
              cards[first],
              cards[second],
              cards[third],
              cards[fourth],
              cards[fifth],
            ];
            if (combination.some((card) => card === undefined)) {
              throw new RangeError('Combination index moved outside the cards');
            }
            combinations.push(Object.freeze(combination as Card[]));
          }
        }
      }
    }
  }

  return Object.freeze(combinations);
}
