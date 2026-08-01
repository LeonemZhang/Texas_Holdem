import type { Card } from '../cards/card.js';
import { analyzeFiveCards } from './five-card-analysis.js';

export const HAND_CATEGORY = Object.freeze({
  HIGH_CARD: 0,
  ONE_PAIR: 1,
  TWO_PAIR: 2,
  THREE_OF_A_KIND: 3,
  STRAIGHT: 4,
  FLUSH: 5,
  FULL_HOUSE: 6,
  FOUR_OF_A_KIND: 7,
  STRAIGHT_FLUSH: 8,
} as const);

export type HandCategory = (typeof HAND_CATEGORY)[keyof typeof HAND_CATEGORY];

export type HandRank = readonly [HandCategory, ...number[]];

function handRank(
  category: HandCategory,
  ...tiebreakers: readonly number[]
): HandRank {
  return Object.freeze([category, ...tiebreakers]);
}

export function rankFiveCards(cards: readonly Card[]): HandRank {
  const { rankGroups, isFlush, straightHigh } = analyzeFiveCards(cards);
  const valuesDescending = rankGroups
    .map(({ value }) => value)
    .sort((left, right) => right - left);
  const primary = rankGroups[0];
  const secondary = rankGroups[1];

  if (straightHigh !== null && isFlush) {
    return handRank(HAND_CATEGORY.STRAIGHT_FLUSH, straightHigh);
  }

  if (primary?.count === 4) {
    return handRank(
      HAND_CATEGORY.FOUR_OF_A_KIND,
      primary.value,
      secondary?.value ?? 0,
    );
  }

  if (primary?.count === 3 && secondary?.count === 2) {
    return handRank(HAND_CATEGORY.FULL_HOUSE, primary.value, secondary.value);
  }

  if (isFlush) {
    return handRank(HAND_CATEGORY.FLUSH, ...valuesDescending);
  }

  if (straightHigh !== null) {
    return handRank(HAND_CATEGORY.STRAIGHT, straightHigh);
  }

  if (primary?.count === 3) {
    return handRank(
      HAND_CATEGORY.THREE_OF_A_KIND,
      primary.value,
      ...valuesDescending.filter((value) => value !== primary.value),
    );
  }

  const pairs = rankGroups.filter(({ count }) => count === 2);
  if (pairs.length === 2) {
    const pairValues = pairs.map(({ value }) => value).sort((a, b) => b - a);
    const kicker = rankGroups.find(({ count }) => count === 1);
    return handRank(HAND_CATEGORY.TWO_PAIR, ...pairValues, kicker?.value ?? 0);
  }

  if (primary?.count === 2) {
    return handRank(
      HAND_CATEGORY.ONE_PAIR,
      primary.value,
      ...valuesDescending.filter((value) => value !== primary.value),
    );
  }

  return handRank(HAND_CATEGORY.HIGH_CARD, ...valuesDescending);
}
