import { evaluateStrings, rankBoard } from '@pokertools/evaluator';
import { describe, expect, it } from 'vitest';

import { formatCard, type CardCode } from '../cards/card.js';
import { createStandardDeck } from '../cards/deck.js';
import { findBestFiveCardHand } from './best-hand.js';
import { compareHandRanks } from './compare-hand-ranks.js';

const SAMPLE_HANDS = 4_000;
const FIXED_SEED = 0x5eed_2026;

function createDeterministicRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
}

function sampleSevenCardHands(count: number): readonly CardCode[][] {
  const random = createDeterministicRandom(FIXED_SEED);
  const deck = createStandardDeck();
  const hands: CardCode[][] = [];

  for (let handIndex = 0; handIndex < count; handIndex += 1) {
    const available = [...deck];
    const hand: CardCode[] = [];
    for (let cardIndex = 0; cardIndex < 7; cardIndex += 1) {
      const selected =
        cardIndex + Math.floor(random() * (available.length - cardIndex));
      [available[cardIndex], available[selected]] = [
        available[selected]!,
        available[cardIndex]!,
      ];
      hand.push(formatCard(available[cardIndex]!));
    }
    hands.push(hand);
  }

  return hands;
}

describe('seven-card reference differential', () => {
  const hands = sampleSevenCardHands(SAMPLE_HANDS);

  it(`matches reference categories for ${SAMPLE_HANDS.toLocaleString()} fixed-seed hands`, () => {
    for (const codes of hands) {
      const ours = findBestFiveCardHand(
        codes.map((code) => {
          const card = createStandardDeck().find(
            (candidate) => formatCard(candidate) === code,
          );
          if (!card) {
            throw new RangeError(`Missing sampled card: ${code}`);
          }
          return card;
        }),
      );
      const referenceCategory = rankBoard(codes.join(' '));

      expect(ours.rank[0], codes.join(' ')).toBe(8 - referenceCategory);
    }
  });

  it('matches reference strength ordering and ties for adjacent samples', () => {
    for (let index = 1; index < hands.length; index += 1) {
      const leftCodes = hands[index - 1]!;
      const rightCodes = hands[index]!;
      const deck = createStandardDeck();
      const toCards = (codes: readonly CardCode[]) =>
        codes.map((code) =>
          deck.find((candidate) => formatCard(candidate) === code)!,
        );
      const ours = compareHandRanks(
        findBestFiveCardHand(toCards(leftCodes)).rank,
        findBestFiveCardHand(toCards(rightCodes)).rank,
      );
      const leftReference = evaluateStrings(leftCodes);
      const rightReference = evaluateStrings(rightCodes);
      const reference = Math.sign(rightReference - leftReference);

      expect(ours, `${leftCodes.join(' ')} vs ${rightCodes.join(' ')}`).toBe(
        reference,
      );
    }
  });
});
