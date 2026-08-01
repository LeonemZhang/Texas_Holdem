import { describe, expect, it } from 'vitest';

import { applyHandAction } from './hand-reducer.js';
import { applyPreflopAction } from './preflop-reducer.js';
import { startHand, type StartedHandState } from './start-hand.js';
import { advanceAfterCompletedBetting, advanceToFlop } from './streets.js';

function headsUp(stack = 100): StartedHandState {
  return startHand({
    handId: 'streets',
    participants: [
      { playerId: 'a', seatIndex: 0, stack },
      { playerId: 'b', seatIndex: 5, stack },
    ],
    previousButtonIndex: null,
    smallBlind: 1,
    randomSource: { next: () => 0 },
  });
}

function checkedStreet(hand: StartedHandState): StartedHandState {
  let next = applyHandAction(hand, 'b', { type: 'check' });
  next = applyHandAction(next, 'a', { type: 'check' });
  return next;
}

describe('turn and river progression', () => {
  it('deals exactly one turn and one river with postflop action order', () => {
    let hand = headsUp();
    hand = applyPreflopAction(hand, 'a', { type: 'call' });
    hand = applyPreflopAction(hand, 'b', { type: 'check' });
    hand = advanceToFlop(hand);
    expect(hand.betting.currentActorId).toBe('b');
    hand = advanceAfterCompletedBetting(checkedStreet(hand));
    expect(hand.street).toBe('turn');
    expect(hand.communityCards).toHaveLength(4);
    expect(hand.betting.currentActorId).toBe('b');
    hand = advanceAfterCompletedBetting(checkedStreet(hand));
    expect(hand.street).toBe('river');
    expect(hand.communityCards).toHaveLength(5);
  });

  it('automatically runs all community cards when nobody can act', () => {
    let hand = headsUp(2);
    hand = applyPreflopAction(hand, 'a', { type: 'call' });
    expect(hand.betting.currentActorId).toBeNull();
    hand = advanceAfterCompletedBetting(hand);
    expect(hand.street).toBe('river');
    expect(hand.communityCards).toHaveLength(5);
    expect(hand.betting.currentActorId).toBeNull();
  });
});
