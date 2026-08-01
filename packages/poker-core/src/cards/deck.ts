import {
  RANKS,
  SUITS,
  createCard,
  formatCard,
  type Card,
  type CardCode,
} from './card.js';

export class DuplicateCardError extends Error {
  readonly code: CardCode;

  constructor(code: CardCode) {
    super(`Duplicate card: ${code}`);
    this.name = 'DuplicateCardError';
    this.code = code;
  }
}

export function assertUniqueCards(cards: readonly Card[]): void {
  const seen = new Set<CardCode>();
  for (const card of cards) {
    const code = formatCard(card);
    if (seen.has(code)) {
      throw new DuplicateCardError(code);
    }
    seen.add(code);
  }
}

export function createStandardDeck(): readonly Card[] {
  const cards = RANKS.flatMap((rank) =>
    SUITS.map((suit) => createCard(rank, suit)),
  );
  assertUniqueCards(cards);
  return Object.freeze(cards);
}
