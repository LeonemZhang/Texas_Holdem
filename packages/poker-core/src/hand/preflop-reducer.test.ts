import { describe, expect, it } from 'vitest';

import { applyPreflopAction } from './preflop-reducer.js';
import { startHand } from './start-hand.js';

const random = { next: () => 0 };

function headsUpHand() {
  return startHand({
    handId: 'hand-1',
    participants: [
      { playerId: 'a', seatIndex: 0, stack: 100 },
      { playerId: 'b', seatIndex: 5, stack: 100 },
    ],
    previousButtonIndex: null,
    smallBlind: 1,
    randomSource: random,
  });
}

describe('applyPreflopAction', () => {
  it('accepts a legal current-player command and synchronizes hand chips', () => {
    const initial = headsUpHand();
    const next = applyPreflopAction(initial, 'a', { type: 'call' });
    expect(initial.players[0]).toMatchObject({ stack: 99, streetCommitted: 1 });
    expect(next.players[0]).toMatchObject({ stack: 98, streetCommitted: 2 });
    expect(next.players[0]).toMatchObject({ lastAction: 'call' });
    expect(next.betting.currentActorId).toBe('b');
  });

  it('rejects a command from anyone except the legal current actor', () => {
    expect(() =>
      applyPreflopAction(headsUpHand(), 'b', { type: 'check' }),
    ).toThrow("It is not b's turn");
  });

  it('returns an immutable state that round-trips through JSON', () => {
    const next = applyPreflopAction(headsUpHand(), 'a', { type: 'fold' });
    expect(Object.isFrozen(next)).toBe(true);
    expect(JSON.parse(JSON.stringify(next))).toMatchObject({
      handId: 'hand-1',
      street: 'preflop',
      betting: { currentActorId: 'b' },
    });
  });
});
