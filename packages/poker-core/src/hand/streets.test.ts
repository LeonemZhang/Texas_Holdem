import { describe, expect, it } from 'vitest';

import { applyPreflopAction } from './preflop-reducer.js';
import { startHand } from './start-hand.js';
import { advanceToFlop } from './streets.js';

function completedPreflop() {
  let hand = startHand({
    handId: 'h-flop',
    participants: [
      { playerId: 'a', seatIndex: 0, stack: 100 },
      { playerId: 'b', seatIndex: 5, stack: 100 },
    ],
    previousButtonIndex: null,
    smallBlind: 1,
    randomSource: { next: () => 0 },
  });
  hand = applyPreflopAction(hand, 'a', { type: 'call' });
  return applyPreflopAction(hand, 'b', { type: 'check' });
}

describe('advanceToFlop', () => {
  it('deals exactly three community cards and initializes postflop action', () => {
    const before = completedPreflop();
    const flop = advanceToFlop(before);
    expect(before.communityCards).toEqual([]);
    expect(flop.street).toBe('flop');
    expect(flop.communityCards).toHaveLength(3);
    expect(flop.deckCursor).toBe(before.deckCursor + 3);
    expect(flop.betting.currentActorId).toBe('b');
  });

  it('resets street investments while preserving cumulative investments', () => {
    const flop = advanceToFlop(completedPreflop());
    expect(flop.players.map(({ streetCommitted }) => streetCommitted)).toEqual([
      0, 0,
    ]);
    expect(flop.players.map(({ totalCommitted }) => totalCommitted)).toEqual([
      2, 2,
    ]);
  });

  it('refuses to deal before the preflop betting round completes', () => {
    const hand = startHand({
      handId: 'unfinished',
      participants: [
        { playerId: 'a', seatIndex: 0, stack: 100 },
        { playerId: 'b', seatIndex: 5, stack: 100 },
      ],
      previousButtonIndex: null,
      smallBlind: 1,
      randomSource: { next: () => 0 },
    });
    expect(() => advanceToFlop(hand)).toThrow('Betting round is not complete');
  });
});
