import { describe, expect, it } from 'vitest';

import {
  applyBettingAction,
  isBettingRoundComplete,
  legalBettingActions,
} from './betting-round.js';
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

describe('betting round facade', () => {
  it('dispatches actions and finishes when every active player has matched', () => {
    let state = createBettingRound(
      [player('a', 98, 2), player('b', 96, 4)],
      2,
      'a',
    );
    state = applyBettingAction(state, 'a', { type: 'call' });
    state = applyBettingAction(state, 'b', { type: 'check' });
    expect(isBettingRoundComplete(state)).toBe(true);
    expect(state.currentActorId).toBeNull();
  });

  it('finishes immediately when only one non-folded contender remains', () => {
    let state = createBettingRound([player('a'), player('b')], 2, 'a');
    state = applyBettingAction(state, 'a', { type: 'fold' });
    expect(isBettingRoundComplete(state)).toBe(true);
  });

  it('projects actions that can be sent directly in a server snapshot', () => {
    const state = createBettingRound(
      [player('a', 20, 2), player('b', 96, 4)],
      2,
      'a',
    );
    expect(legalBettingActions(state)).toEqual({
      canFold: true,
      canCheck: false,
      callAmount: 2,
      minimumRaiseTo: 6,
      maximumRaiseTo: 22,
      canAllIn: true,
    });
    expect(legalBettingActions(state, 'b')).toEqual({
      canFold: false,
      canCheck: false,
      callAmount: null,
      minimumRaiseTo: null,
      maximumRaiseTo: null,
      canAllIn: false,
    });
  });

  it('offers short all-in instead of an impossible standard call or raise', () => {
    const state = createBettingRound(
      [player('short', 3), player('deep', 90, 10)],
      10,
      'short',
    );
    expect(legalBettingActions(state)).toMatchObject({
      callAmount: null,
      minimumRaiseTo: null,
      maximumRaiseTo: null,
      canAllIn: true,
    });
  });
});
