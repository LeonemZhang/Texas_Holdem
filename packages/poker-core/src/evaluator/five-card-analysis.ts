import { type Card, type Rank } from '../cards/card.js';
import { assertUniqueCards } from '../cards/deck.js';

export const RANK_VALUES: Readonly<Record<Rank, number>> = Object.freeze({
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
});

export interface RankGroup {
  readonly rank: Rank;
  readonly value: number;
  readonly count: number;
}

export interface FiveCardAnalysis {
  readonly rankGroups: readonly RankGroup[];
  readonly isFlush: boolean;
  readonly straightHigh: number | null;
}

function assertFiveUniqueCards(cards: readonly Card[]): void {
  if (cards.length !== 5) {
    throw new RangeError(`Expected 5 cards, received ${cards.length}`);
  }
  assertUniqueCards(cards);
}

function buildRankGroups(cards: readonly Card[]): readonly RankGroup[] {
  const counts = new Map<Rank, number>();
  for (const card of cards) {
    counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1);
  }

  const groups = [...counts].map(([rank, count]) =>
    Object.freeze({ rank, value: RANK_VALUES[rank], count }),
  );
  groups.sort((left, right) =>
    left.count === right.count
      ? right.value - left.value
      : right.count - left.count,
  );
  return Object.freeze(groups);
}

function detectStraightHigh(rankGroups: readonly RankGroup[]): number | null {
  if (rankGroups.length !== 5) {
    return null;
  }

  const values = rankGroups.map(({ value }) => value).sort((a, b) => a - b);
  if (values.join(',') === '2,3,4,5,14') {
    return 5;
  }

  return values.every((value, index) =>
    index === 0 ? true : value === (values[index - 1] ?? 0) + 1,
  )
    ? (values.at(-1) ?? null)
    : null;
}

export function analyzeFiveCards(cards: readonly Card[]): FiveCardAnalysis {
  assertFiveUniqueCards(cards);
  const rankGroups = buildRankGroups(cards);
  const firstSuit = cards[0]?.suit;

  return Object.freeze({
    rankGroups,
    isFlush: cards.every(({ suit }) => suit === firstSuit),
    straightHigh: detectStraightHigh(rankGroups),
  });
}
