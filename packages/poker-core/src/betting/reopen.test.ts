import { describe, expect, it } from 'vitest';

import { applyAllIn } from './all-in.js';
import { applyBasicBettingAction } from './basic-actions.js';
import { applyRaiseTo } from './raise.js';
import { isRaiseReopenedFor } from './reopen.js';
import { createBettingRound, type BettingPlayer } from './state.js';

function player(
  id: string,
  stack: number,
  committed = 10,
): Omit<BettingPlayer, 'actedAtBet'> {
  return {
    playerId: id,
    stack,
    streetCommitted: committed,
    totalCommitted: committed,
    status: 'active',
  };
}

describe('short all-in raise reopening', () => {
  it('does not reopen a player after one insufficient all-in raise', () => {
    let state = createBettingRound(
      [player('a', 90), player('short', 4), player('deep', 90)],
      10,
      'a',
    );
    state = applyBasicBettingAction(state, 'a', { type: 'check' });
    state = applyAllIn(state, 'short');
    state = applyBasicBettingAction(state, 'deep', { type: 'call' });

    const actor = state.players.find(({ playerId }) => playerId === 'a')!;
    expect(state.currentActorId).toBe('a');
    expect(isRaiseReopenedFor(state, actor)).toBe(false);
    expect(() => applyRaiseTo(state, 'a', 24)).toThrow(
      'Raising is not reopened',
    );
  });

  it('reopens after multiple short all-ins cumulatively reach a full raise', () => {
    let state = createBettingRound(
      [player('a', 90), player('s1', 4), player('s2', 10), player('deep', 90)],
      10,
      'a',
    );
    state = applyBasicBettingAction(state, 'a', { type: 'check' });
    state = applyAllIn(state, 's1');
    state = applyAllIn(state, 's2');
    state = applyBasicBettingAction(state, 'deep', { type: 'call' });

    const actor = state.players.find(({ playerId }) => playerId === 'a')!;
    expect(state.currentBet).toBe(20);
    expect(isRaiseReopenedFor(state, actor)).toBe(true);
    expect(applyRaiseTo(state, 'a', 30).currentBet).toBe(30);
  });

  it('does not allow a locked player to bypass the rule with all-in', () => {
    let state = createBettingRound(
      [player('a', 90), player('short', 4), player('deep', 90)],
      10,
      'a',
    );
    state = applyBasicBettingAction(state, 'a', { type: 'check' });
    state = applyAllIn(state, 'short');
    state = applyBasicBettingAction(state, 'deep', { type: 'call' });
    expect(() => applyAllIn(state, 'a')).toThrow('Raising is not reopened');
  });
});
