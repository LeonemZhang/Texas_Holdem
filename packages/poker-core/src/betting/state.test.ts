import { describe, expect, it } from 'vitest';

import { createBettingRound, type BettingPlayer } from './state.js';

function player(
  playerId: string,
  stack = 100,
  streetCommitted = 0,
): Omit<BettingPlayer, 'actedAtBet'> {
  return {
    playerId,
    stack,
    streetCommitted,
    totalCommitted: streetCommitted,
    status: 'active',
  };
}

describe('createBettingRound', () => {
  it('creates an immutable ordered pending set from the current actor', () => {
    const state = createBettingRound(
      [player('a', 98, 2), player('b', 96, 4), player('c', 100)],
      2,
      'b',
    );
    expect(state.currentBet).toBe(4);
    expect(state.pendingPlayerIds).toEqual(['b', 'c', 'a']);
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.players)).toBe(true);
  });

  it('rejects negative and unsafe chip amounts', () => {
    expect(() => createBettingRound([player('a', -1), player('b')], 2)).toThrow(
      'Stack must be a non-negative safe integer',
    );
    expect(() =>
      createBettingRound(
        [player('a', Number.MAX_SAFE_INTEGER + 1), player('b')],
        2,
      ),
    ).toThrow('Stack must be a non-negative safe integer');
  });

  it('rejects duplicate players and an illegal current actor', () => {
    expect(() => createBettingRound([player('a'), player('a')], 2)).toThrow(
      'Duplicate or empty player id: a',
    );
    expect(() =>
      createBettingRound([player('a'), player('b')], 2, 'c'),
    ).toThrow('Current actor is not active: c');
  });
});
