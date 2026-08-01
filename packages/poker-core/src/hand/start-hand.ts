import {
  createBettingRound,
  type BettingRoundState,
} from '../betting/state.js';
import type { Card } from '../cards/card.js';
import { createStandardDeck } from '../cards/deck.js';
import { shuffleCards, type RandomSource } from '../cards/shuffle.js';
import {
  actionOrderForStreet,
  assignTablePositions,
  type TablePositions,
} from '../seating/positions.js';
import { eligibleSeatsClockwise, type Seat } from '../seating/seats.js';

export interface HandParticipantInput {
  readonly playerId: string;
  readonly seatIndex: number;
  readonly stack: number;
}

export interface HandPlayerState {
  readonly playerId: string;
  readonly seatIndex: number;
  readonly stack: number;
  readonly streetCommitted: number;
  readonly totalCommitted: number;
  readonly status: 'active' | 'folded' | 'all-in';
  readonly holeCards: readonly [Card, Card];
}

export type HandStreet = 'preflop' | 'flop' | 'turn' | 'river';

export interface StartedHandState {
  readonly handId: string;
  readonly street: HandStreet;
  readonly positions: TablePositions;
  readonly players: readonly HandPlayerState[];
  readonly communityCards: readonly Card[];
  readonly deck: readonly Card[];
  readonly deckCursor: number;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly betting: BettingRoundState;
}

export interface StartHandOptions {
  readonly handId: string;
  readonly participants: readonly HandParticipantInput[];
  readonly previousButtonIndex: number | null;
  readonly smallBlind: number;
  readonly randomSource: RandomSource;
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
}

export function startHand(options: StartHandOptions): StartedHandState {
  if (!options.handId) throw new RangeError('Hand id cannot be empty');
  if (options.participants.length < 2 || options.participants.length > 10) {
    throw new RangeError('A hand requires 2 to 10 participants');
  }
  assertPositiveSafeInteger(options.smallBlind, 'Small blind');
  const bigBlind = options.smallBlind * 2;
  assertPositiveSafeInteger(bigBlind, 'Big blind');

  const ids = new Set<string>();
  const seats: readonly Seat[] = options.participants.map((participant) => {
    if (!participant.playerId || ids.has(participant.playerId)) {
      throw new RangeError(
        `Duplicate or empty player id: ${participant.playerId}`,
      );
    }
    ids.add(participant.playerId);
    assertPositiveSafeInteger(participant.stack, 'Player stack');
    return Object.freeze({
      index: participant.seatIndex,
      playerId: participant.playerId,
      status: 'active' as const,
    });
  });
  const positions = assignTablePositions(seats, options.previousButtonIndex);
  const deck = shuffleCards(createStandardDeck(), options.randomSource);
  const dealOrder = eligibleSeatsClockwise(seats, positions.button.index);
  const holeCards = new Map<string, Card[]>();
  let cursor = 0;
  for (let round = 0; round < 2; round += 1) {
    for (const seat of dealOrder) {
      const card = deck[cursor];
      if (!card) throw new RangeError('Deck ended while dealing hole cards');
      cursor += 1;
      holeCards.set(seat.playerId, [
        ...(holeCards.get(seat.playerId) ?? []),
        card,
      ]);
    }
  }

  const players = options.participants.map((participant) => {
    const blind =
      participant.playerId === positions.bigBlind.playerId
        ? bigBlind
        : participant.playerId === positions.smallBlind.playerId
          ? options.smallBlind
          : 0;
    const paid = Math.min(blind, participant.stack);
    const cards = holeCards.get(participant.playerId);
    if (!cards?.[0] || !cards[1]) {
      throw new RangeError(`Missing hole cards for ${participant.playerId}`);
    }
    return Object.freeze({
      playerId: participant.playerId,
      seatIndex: participant.seatIndex,
      stack: participant.stack - paid,
      streetCommitted: paid,
      totalCommitted: paid,
      status:
        paid === participant.stack ? ('all-in' as const) : ('active' as const),
      holeCards: Object.freeze([cards[0], cards[1]]) as readonly [Card, Card],
    });
  });
  const firstActor = actionOrderForStreet(seats, positions, 'preflop').find(
    (seat) =>
      players.find(({ playerId }) => playerId === seat.playerId)?.status ===
      'active',
  );
  const betting = createBettingRound(
    players.map(
      ({ holeCards: _holeCards, seatIndex: _seatIndex, ...player }) => player,
    ),
    bigBlind,
    firstActor?.playerId,
  );

  return Object.freeze({
    handId: options.handId,
    street: 'preflop',
    positions,
    players: Object.freeze(players),
    communityCards: Object.freeze([]),
    deck,
    deckCursor: cursor,
    smallBlind: options.smallBlind,
    bigBlind,
    betting,
  });
}
