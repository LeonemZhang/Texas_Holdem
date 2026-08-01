import type { Card } from '../cards/card.js';
import { chooseFiveFromSeven } from './combinations.js';
import { compareHandRanks } from './compare-hand-ranks.js';
import { rankFiveCards, type HandRank } from './hand-rank.js';

export interface BestFiveCardHand {
  readonly cards: readonly Card[];
  readonly rank: HandRank;
}

export function findBestFiveCardHand(
  sevenCards: readonly Card[],
): BestFiveCardHand {
  const combinations = chooseFiveFromSeven(sevenCards);
  let bestCards = combinations[0];
  if (!bestCards) {
    throw new RangeError('No five-card combinations were generated');
  }
  let bestRank = rankFiveCards(bestCards);

  for (const candidateCards of combinations.slice(1)) {
    const candidateRank = rankFiveCards(candidateCards);
    if (compareHandRanks(candidateRank, bestRank) > 0) {
      bestCards = candidateCards;
      bestRank = candidateRank;
    }
  }

  return Object.freeze({ cards: bestCards, rank: bestRank });
}
