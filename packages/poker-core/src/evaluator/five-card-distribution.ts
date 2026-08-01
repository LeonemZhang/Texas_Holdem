import type { Card } from '../cards/card.js';
import { createStandardDeck } from '../cards/deck.js';
import {
  HAND_CATEGORY,
  rankFiveCards,
  type HandCategory,
} from './hand-rank.js';

export const STANDARD_FIVE_CARD_DISTRIBUTION: Readonly<
  Record<HandCategory, number>
> = Object.freeze({
  [HAND_CATEGORY.HIGH_CARD]: 1_302_540,
  [HAND_CATEGORY.ONE_PAIR]: 1_098_240,
  [HAND_CATEGORY.TWO_PAIR]: 123_552,
  [HAND_CATEGORY.THREE_OF_A_KIND]: 54_912,
  [HAND_CATEGORY.STRAIGHT]: 10_200,
  [HAND_CATEGORY.FLUSH]: 5_108,
  [HAND_CATEGORY.FULL_HOUSE]: 3_744,
  [HAND_CATEGORY.FOUR_OF_A_KIND]: 624,
  [HAND_CATEGORY.STRAIGHT_FLUSH]: 40,
});

export function countFiveCardHandDistribution(
  deck: readonly Card[] = createStandardDeck(),
): Readonly<Record<HandCategory, number>> {
  if (deck.length !== 52) {
    throw new RangeError(`Expected a 52-card deck, received ${deck.length}`);
  }

  const counts = Array.from({ length: 9 }, () => 0);
  for (let first = 0; first < 48; first += 1) {
    for (let second = first + 1; second < 49; second += 1) {
      for (let third = second + 1; third < 50; third += 1) {
        for (let fourth = third + 1; fourth < 51; fourth += 1) {
          for (let fifth = fourth + 1; fifth < 52; fifth += 1) {
            const cards = [
              deck[first]!,
              deck[second]!,
              deck[third]!,
              deck[fourth]!,
              deck[fifth]!,
            ];
            const category = rankFiveCards(cards)[0];
            counts[category] = (counts[category] ?? 0) + 1;
          }
        }
      }
    }
  }

  return Object.freeze({
    [HAND_CATEGORY.HIGH_CARD]: counts[HAND_CATEGORY.HIGH_CARD] ?? 0,
    [HAND_CATEGORY.ONE_PAIR]: counts[HAND_CATEGORY.ONE_PAIR] ?? 0,
    [HAND_CATEGORY.TWO_PAIR]: counts[HAND_CATEGORY.TWO_PAIR] ?? 0,
    [HAND_CATEGORY.THREE_OF_A_KIND]: counts[HAND_CATEGORY.THREE_OF_A_KIND] ?? 0,
    [HAND_CATEGORY.STRAIGHT]: counts[HAND_CATEGORY.STRAIGHT] ?? 0,
    [HAND_CATEGORY.FLUSH]: counts[HAND_CATEGORY.FLUSH] ?? 0,
    [HAND_CATEGORY.FULL_HOUSE]: counts[HAND_CATEGORY.FULL_HOUSE] ?? 0,
    [HAND_CATEGORY.FOUR_OF_A_KIND]: counts[HAND_CATEGORY.FOUR_OF_A_KIND] ?? 0,
    [HAND_CATEGORY.STRAIGHT_FLUSH]: counts[HAND_CATEGORY.STRAIGHT_FLUSH] ?? 0,
  });
}

export function verifyStandardFiveCardDistribution(): void {
  const actual = countFiveCardHandDistribution();
  for (const [category, expected] of Object.entries(
    STANDARD_FIVE_CARD_DISTRIBUTION,
  )) {
    const actualCount = actual[Number(category) as HandCategory];
    if (actualCount !== expected) {
      throw new Error(
        `Category ${category}: expected ${expected}, received ${actualCount}`,
      );
    }
  }
}
