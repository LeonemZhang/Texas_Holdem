import type { Card } from './card.js';
import { assertUniqueCards } from './deck.js';

export interface RandomSource {
  next(): number;
}

function nextIndex(random: RandomSource, upperExclusive: number): number {
  const value = random.next();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError(`Random source returned an invalid value: ${value}`);
  }
  return Math.floor(value * upperExclusive);
}

export function shuffleCards(
  cards: readonly Card[],
  random: RandomSource,
): readonly Card[] {
  assertUniqueCards(cards);
  const shuffled = [...cards];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = nextIndex(random, index + 1);
    const current = shuffled[index];
    const target = shuffled[swapIndex];
    if (!current || !target) {
      throw new RangeError('Shuffle index moved outside the card collection');
    }
    shuffled[index] = target;
    shuffled[swapIndex] = current;
  }

  return Object.freeze(shuffled);
}
