import { describe, expect, it } from 'vitest';

import { applyPreflopAction } from './preflop-reducer.js';
import { startHand } from './start-hand.js';
import { settleUncontestedHand } from './uncontested.js';

function foldedHand() {
  const hand = startHand({
    handId: 'folded',
    participants: [
      { playerId: 'a', seatIndex: 0, stack: 100 },
      { playerId: 'b', seatIndex: 5, stack: 100 },
    ],
    previousButtonIndex: null,
    smallBlind: 1,
    randomSource: { next: () => 0 },
  });
  return applyPreflopAction(hand, 'a', { type: 'fold' });
}

describe('settleUncontestedHand', () => {
  it('awards every invested chip to the only non-folded player', () => {
    const settled = settleUncontestedHand(foldedHand());
    expect(settled.settlement).toMatchObject({
      reason: 'uncontested',
      winnerIds: ['b'],
      payouts: { b: 3 },
    });
    expect(settled.players.map(({ stack }) => stack)).toEqual([99, 101]);
    expect(settled.players.reduce((sum, player) => sum + player.stack, 0)).toBe(
      200,
    );
  });

  it('does not deal community cards or reveal irrelevant hole cards', () => {
    const settled = settleUncontestedHand(foldedHand());
    expect(settled.communityCards).toEqual([]);
    expect(settled.settlement.revealedHoleCards).toEqual({});
  });

  it('rejects settlement while several contenders remain', () => {
    const hand = startHand({
      handId: 'live',
      participants: [
        { playerId: 'a', seatIndex: 0, stack: 100 },
        { playerId: 'b', seatIndex: 5, stack: 100 },
      ],
      previousButtonIndex: null,
      smallBlind: 1,
      randomSource: { next: () => 0 },
    });
    expect(() => settleUncontestedHand(hand)).toThrow(
      'Betting round is not complete',
    );
  });
});
