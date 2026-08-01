import type { HandRank } from './hand-rank.js';

export type HandRankComparison = -1 | 0 | 1;

export function compareHandRanks(
  left: HandRank,
  right: HandRank,
): HandRankComparison {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    if (leftValue > rightValue) {
      return 1;
    }
    if (leftValue < rightValue) {
      return -1;
    }
  }
  return 0;
}
