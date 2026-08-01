import { describe, expect, it } from 'vitest';

import { applyBasicBettingAction } from './basic-actions.js';
import { createBettingRound, type BettingPlayer } from './state.js';

function player(
  id: string,
  stack: number,
  committed: number,
): Omit<BettingPlayer, 'actedAtBet'> {
  return {
    playerId: id,
    stack,
    streetCommitted: committed,
    totalCommitted: committed,
    status: 'active',
  };
}

describe('basic betting actions', () => {
  it('folds the current player and advances clockwise', () => {
    const state = createBettingRound(
      [player('a', 98, 2), player('b', 96, 4)],
      2,
      'a',
    );
    const next = applyBasicBettingAction(state, 'a', { type: 'fold' });
    expect(next.players[0]?.status).toBe('folded');
    expect(next.currentActorId).toBe('b');
  });

  it('allows checking only when the current bet is matched', () => {
    const state = createBettingRound(
      [player('a', 96, 4), player('b', 96, 4)],
      2,
      'a',
    );
    expect(
      applyBasicBettingAction(state, 'a', { type: 'check' }).currentActorId,
    ).toBe('b');
    const facingBet = createBettingRound(
      [player('a', 98, 2), player('b', 96, 4)],
      2,
      'a',
    );
    expect(() =>
      applyBasicBettingAction(facingBet, 'a', { type: 'check' }),
    ).toThrow('Cannot check while facing a bet');
  });

  it('calls the exact amount without mutating the input', () => {
    const state = createBettingRound(
      [player('a', 98, 2), player('b', 96, 4)],
      2,
      'a',
    );
    const next = applyBasicBettingAction(state, 'a', { type: 'call' });
    expect(state.players[0]?.streetCommitted).toBe(2);
    expect(next.players[0]).toMatchObject({
      stack: 96,
      streetCommitted: 4,
      totalCommitted: 4,
    });
  });

  it('rejects an underfunded ordinary call and a non-current player', () => {
    const state = createBettingRound(
      [player('a', 1, 2), player('b', 96, 4)],
      2,
      'a',
    );
    expect(() => applyBasicBettingAction(state, 'a', { type: 'call' })).toThrow(
      'Insufficient stack for a full call',
    );
    expect(() => applyBasicBettingAction(state, 'b', { type: 'fold' })).toThrow(
      "It is not b's turn",
    );
  });
});
