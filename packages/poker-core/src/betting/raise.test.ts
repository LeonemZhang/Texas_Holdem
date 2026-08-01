import { describe, expect, it } from 'vitest';

import { applyRaiseTo } from './raise.js';
import { createBettingRound, type BettingPlayer } from './state.js';

function player(
  id: string,
  stack = 100,
  committed = 0,
): Omit<BettingPlayer, 'actedAtBet'> {
  return {
    playerId: id,
    stack,
    streetCommitted: committed,
    totalCommitted: committed,
    status: 'active',
  };
}

describe('applyRaiseTo', () => {
  it('uses one target-amount semantic for the first bet', () => {
    const state = createBettingRound([player('a'), player('b')], 2);
    const next = applyRaiseTo(state, 'a', 6);
    expect(next.currentBet).toBe(6);
    expect(next.minimumRaiseIncrement).toBe(6);
    expect(next.players[0]).toMatchObject({ stack: 94, streetCommitted: 6 });
  });

  it('sets a standard raise increment and makes every opponent respond', () => {
    const state = createBettingRound(
      [player('a', 90, 10), player('b', 90, 10), player('c', 90, 10)],
      10,
      'b',
    );
    const next = applyRaiseTo(state, 'b', 25);
    expect(next.minimumRaiseIncrement).toBe(15);
    expect(next.pendingPlayerIds).toEqual(['c', 'a']);
  });

  it('rejects an under-minimum raise and a target beyond the stack', () => {
    const state = createBettingRound(
      [player('a', 90, 10), player('b', 90, 10)],
      10,
    );
    expect(() => applyRaiseTo(state, 'a', 19)).toThrow(
      'Raise target is below the minimum raise',
    );
    expect(() => applyRaiseTo(state, 'a', 101)).toThrow(
      'Raise target exceeds player stack',
    );
  });
});
