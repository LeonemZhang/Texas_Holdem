export const SUITS = ['c', 'd', 'h', 's'] as const;
export type Suit = (typeof SUITS)[number];

export const RANKS = [
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'T',
  'J',
  'Q',
  'K',
  'A',
] as const;
export type Rank = (typeof RANKS)[number];

export type CardCode = `${Rank}${Suit}`;

export interface Card {
  readonly rank: Rank;
  readonly suit: Suit;
}

const suitSet: ReadonlySet<string> = new Set(SUITS);
const rankSet: ReadonlySet<string> = new Set(RANKS);

export function isSuit(value: string): value is Suit {
  return suitSet.has(value);
}

export function isRank(value: string): value is Rank {
  return rankSet.has(value);
}

export function createCard(rank: Rank, suit: Suit): Card {
  return Object.freeze({ rank, suit });
}

export function parseCard(code: string): Card {
  if (code.length !== 2) {
    throw new RangeError(`Invalid card code: ${code}`);
  }

  const rank = code[0];
  const suit = code[1];
  if (!rank || !suit || !isRank(rank) || !isSuit(suit)) {
    throw new RangeError(`Invalid card code: ${code}`);
  }

  return createCard(rank, suit);
}

export function formatCard(card: Card): CardCode {
  return `${card.rank}${card.suit}`;
}

export function cardsEqual(left: Card, right: Card): boolean {
  return left.rank === right.rank && left.suit === right.suit;
}
