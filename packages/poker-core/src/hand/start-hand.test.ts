import { describe, expect, it } from 'vitest';

import { formatCard } from '../cards/card.js';
import { startHand } from './start-hand.js';

const zeroRandom = { next: () => 0 };

describe('startHand', () => {
  it('posts heads-up blinds with the button also small blind', () => {
    const hand = startHand({
      handId: 'h1',
      participants: [
        { playerId: 'a', seatIndex: 2, stack: 100 },
        { playerId: 'b', seatIndex: 7, stack: 100 },
      ],
      previousButtonIndex: null,
      smallBlind: 1,
      randomSource: zeroRandom,
    });
    expect(hand.positions.button.playerId).toBe('a');
    expect(hand.positions.smallBlind.playerId).toBe('a');
    expect(
      hand.players.map(({ stack, streetCommitted }) => [
        stack,
        streetCommitted,
      ]),
    ).toEqual([
      [99, 1],
      [98, 2],
    ]);
    expect(hand.betting.currentActorId).toBe('a');
  });

  it('posts standard three-player blinds and starts left of the big blind', () => {
    const hand = startHand({
      handId: 'h2',
      participants: [
        { playerId: 'a', seatIndex: 0, stack: 100 },
        { playerId: 'b', seatIndex: 3, stack: 100 },
        { playerId: 'c', seatIndex: 8, stack: 100 },
      ],
      previousButtonIndex: 9,
      smallBlind: 5,
      randomSource: zeroRandom,
    });
    expect([
      hand.positions.button.playerId,
      hand.positions.smallBlind.playerId,
      hand.positions.bigBlind.playerId,
    ]).toEqual(['a', 'b', 'c']);
    expect(hand.betting.currentActorId).toBe('a');
  });

  it('deals two unique cards per player and conserves stack plus investments', () => {
    const initialTotal = 300;
    const hand = startHand({
      handId: 'h3',
      participants: [
        { playerId: 'a', seatIndex: 0, stack: 100 },
        { playerId: 'b', seatIndex: 3, stack: 100 },
        { playerId: 'c', seatIndex: 8, stack: 100 },
      ],
      previousButtonIndex: null,
      smallBlind: 5,
      randomSource: zeroRandom,
    });
    const dealt = hand.players.flatMap(({ holeCards }) =>
      holeCards.map(formatCard),
    );
    expect(new Set(dealt).size).toBe(6);
    expect(hand.deckCursor).toBe(6);
    expect(
      hand.players.reduce(
        (sum, player) => sum + player.stack + player.totalCommitted,
        0,
      ),
    ).toBe(initialTotal);
  });
});
