import type { Card } from '../cards/card.js';
import { chooseFiveFrom, chooseFiveFromSeven } from './combinations.js';
import { compareHandRanks } from './compare-hand-ranks.js';
import { rankFiveCards, type HandRank } from './hand-rank.js';

export interface BestFiveCardHand {
  readonly cards: readonly Card[];
  readonly rank: HandRank;
}

function bestFromCombinations(
  combinations: readonly (readonly Card[])[],
): BestFiveCardHand {
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

export function findBestFiveCardHand(
  sevenCards: readonly Card[],
): BestFiveCardHand {
  return bestFromCombinations(chooseFiveFromSeven(sevenCards));
}

/** Evaluates the best five-card hand from the 5–7 cards available at settlement. */
export function findBestAvailableFiveCardHand(
  availableCards: readonly Card[],
): BestFiveCardHand {
  if (availableCards.length > 7) {
    throw new RangeError(
      `Expected at most 7 cards, received ${availableCards.length}`,
    );
  }
  return bestFromCombinations(chooseFiveFrom(availableCards));
}
