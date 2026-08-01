import { describe, expect, it } from 'vitest';

import { applyAllIn } from './all-in.js';
import { createBettingRound, type BettingPlayer } from './state.js';

function player(
  id: string,
  stack: number,
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

describe('applyAllIn', () => {
  it('uses exactly the remaining stack for an insufficient call', () => {
    const state = createBettingRound(
      [player('short', 3), player('deep', 90, 10)],
      10,
      'short',
    );
    const next = applyAllIn(state, 'short');
    expect(next.players[0]).toMatchObject({
      stack: 0,
      streetCommitted: 3,
      status: 'all-in',
    });
    expect(next.currentBet).toBe(10);
  });

  it('allows a short all-in raise without changing the minimum increment', () => {
    const state = createBettingRound(
      [player('short', 4, 10), player('a', 90, 10), player('b', 90, 10)],
      10,
      'short',
    );
    const next = applyAllIn(state, 'short');
    expect(next.currentBet).toBe(14);
    expect(next.minimumRaiseIncrement).toBe(10);
    expect(next.pendingPlayerIds).toEqual(['a', 'b']);
  });

  it('treats a sufficiently large all-in as a complete raise', () => {
    const state = createBettingRound(
      [player('a', 20, 10), player('b', 90, 10)],
      10,
    );
    const next = applyAllIn(state, 'a');
    expect(next.currentBet).toBe(30);
    expect(next.minimumRaiseIncrement).toBe(20);
  });
});
