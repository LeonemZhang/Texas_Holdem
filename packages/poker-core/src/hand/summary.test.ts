import { describe, expect, it } from 'vitest';

import { applyHandAction } from './hand-reducer.js';
import { applyPreflopAction } from './preflop-reducer.js';
import { settleShowdown } from './showdown.js';
import { startHand } from './start-hand.js';
import { advanceAfterCompletedBetting } from './streets.js';
import { createHandSummary } from './summary.js';
import { settleUncontestedHand } from './uncontested.js';

function tinyHeadsUp() {
  return startHand({
    handId: 'summary-hand',
    participants: [
      { playerId: 'a', seatIndex: 0, stack: 2 },
      { playerId: 'b', seatIndex: 5, stack: 2 },
    ],
    previousButtonIndex: null,
    smallBlind: 1,
    randomSource: { next: () => 0 },
  });
}

describe('createHandSummary', () => {
  it('summarizes an uncontested hand without leaking either hole card', () => {
    const folded = applyPreflopAction(tinyHeadsUp(), 'a', { type: 'fold' });
    const summary = createHandSummary(settleUncontestedHand(folded));
    expect(summary).toMatchObject({
      type: 'hand.summary',
      reason: 'uncontested',
      investments: { a: 1, b: 2 },
      payouts: { b: 3 },
      netChanges: { a: -1, b: 1 },
      revealedHoleCards: {},
    });
    expect(JSON.stringify(summary)).not.toContain('holeCards');
  });

  it('evaluates the winner when a hand ends after the flop', () => {
    let hand = startHand({
      handId: 'flop-summary-hand',
      participants: [
        { playerId: 'a', seatIndex: 0, stack: 10 },
        { playerId: 'b', seatIndex: 5, stack: 10 },
      ],
      previousButtonIndex: null,
      smallBlind: 1,
      randomSource: { next: () => 0 },
    });
    hand = applyHandAction(hand, hand.betting.currentActorId!, {
      type: 'call',
    });
    hand = applyHandAction(hand, hand.betting.currentActorId!, {
      type: 'check',
    });
    hand = advanceAfterCompletedBetting(hand);
    hand = applyHandAction(hand, hand.betting.currentActorId!, {
      type: 'fold',
    });

    const summary = createHandSummary(settleUncontestedHand(hand));

    expect(summary.communityCards).toHaveLength(3);
    expect(Object.keys(summary.evaluatedHands ?? {})).toHaveLength(1);
  });

  it('evaluates the winner when a hand ends after the turn', () => {
    let hand = startHand({
      handId: 'turn-summary-hand',
      participants: [
        { playerId: 'a', seatIndex: 0, stack: 10 },
        { playerId: 'b', seatIndex: 5, stack: 10 },
      ],
      previousButtonIndex: null,
      smallBlind: 1,
      randomSource: { next: () => 0 },
    });
    hand = applyHandAction(hand, hand.betting.currentActorId!, {
      type: 'call',
    });
    hand = applyHandAction(hand, hand.betting.currentActorId!, {
      type: 'check',
    });
    hand = advanceAfterCompletedBetting(hand);
    hand = applyHandAction(hand, hand.betting.currentActorId!, {
      type: 'check',
    });
    hand = applyHandAction(hand, hand.betting.currentActorId!, {
      type: 'check',
    });
    hand = advanceAfterCompletedBetting(hand);
    hand = applyHandAction(hand, hand.betting.currentActorId!, {
      type: 'fold',
    });

    const summary = createHandSummary(settleUncontestedHand(hand));

    expect(summary.communityCards).toHaveLength(4);
    expect(Object.keys(summary.evaluatedHands ?? {})).toHaveLength(1);
  });

  it('includes explainable public data for a showdown and round-trips stably', () => {
    let hand = applyPreflopAction(tinyHeadsUp(), 'a', { type: 'call' });
    hand = advanceAfterCompletedBetting(hand);
    const summary = createHandSummary(settleShowdown(hand));
    expect(summary.communityCards).toHaveLength(5);
    expect(Object.keys(summary.revealedHoleCards)).toEqual(['a', 'b']);
    expect(summary.pots.reduce((sum, pot) => sum + pot.amount, 0)).toBe(4);
    expect(JSON.parse(JSON.stringify(summary))).toEqual(summary);
  });
});
