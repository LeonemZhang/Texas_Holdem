import { describe, expect, it } from 'vitest';

import {
  createRiverComebackEvents,
  reduceFactStatistics,
} from './fact-statistics.js';

describe('reduceFactStatistics', () => {
  it('counts confirmed all-ins, heads-up losses, and river comebacks', () => {
    const result = reduceFactStatistics(
      ['a', 'b'],
      [
        {
          type: 'player.action',
          handId: 'h1',
          playerId: 'a',
          action: 'allIn',
          street: 'preflop',
        },
        {
          type: 'showdown.heads-up-loss',
          handId: 'h1',
          loserPlayerId: 'a',
          winnerPlayerId: 'b',
          contenderCount: 2,
        },
        {
          type: 'showdown.river-comeback',
          handId: 'h1',
          winnerPlayerId: 'b',
          leadersBeforeRiver: ['a'],
        },
      ],
    );
    expect(result.a).toMatchObject({ allInCount: 1, headsUpShowdownLosses: 1 });
    expect(result.b?.riverComebackWins).toBe(1);
  });

  it('keeps enough evidence on each fact to explain its title source', () => {
    const headsUp = {
      type: 'showdown.heads-up-loss' as const,
      handId: 'h1',
      loserPlayerId: 'a',
      winnerPlayerId: 'b',
      contenderCount: 2 as const,
    };
    const river = {
      type: 'showdown.river-comeback' as const,
      handId: 'h1',
      winnerPlayerId: 'b',
      leadersBeforeRiver: ['a'],
    };
    expect(headsUp).toMatchObject({ handId: 'h1', contenderCount: 2 });
    expect(river.leadersBeforeRiver).toEqual(['a']);
  });

  it('rejects facts that contradict their own server-side evidence', () => {
    expect(() =>
      reduceFactStatistics(
        ['a'],
        [
          {
            type: 'showdown.river-comeback',
            handId: 'h1',
            winnerPlayerId: 'a',
            leadersBeforeRiver: ['a'],
          },
        ],
      ),
    ).toThrow('River comeback winner was already leading');
  });
});

describe('createRiverComebackEvents', () => {
  it('records a winner who overtakes the turn leader on the river', () => {
    const events = createRiverComebackEvents({
      type: 'hand.summary',
      handId: 'river-hand',
      reason: 'showdown',
      buttonIndex: 0,
      participants: [
        { playerId: 'a', seatIndex: 0 },
        { playerId: 'b', seatIndex: 1 },
      ],
      communityCards: ['2c', '7d', '9h', 'Ks', 'Tc'],
      investments: { a: 10, b: 10 },
      pots: [{ amount: 20, winnerIds: ['b'] }],
      winnerIds: ['b'],
      payouts: { b: 20 },
      netChanges: { a: -10, b: 10 },
      revealedHoleCards: {
        a: ['Ah', 'Ad'],
        b: ['Qc', 'Jc'],
      },
    });

    expect(events).toEqual([
      {
        type: 'showdown.river-comeback',
        handId: 'river-hand',
        winnerPlayerId: 'b',
        leadersBeforeRiver: ['a'],
      },
    ]);
  });

  it('does not record a winner who was already leading before the river', () => {
    const events = createRiverComebackEvents({
      type: 'hand.summary',
      handId: 'river-hand',
      reason: 'showdown',
      buttonIndex: 0,
      participants: [
        { playerId: 'a', seatIndex: 0 },
        { playerId: 'b', seatIndex: 1 },
      ],
      communityCards: ['2c', '7d', '9h', 'Ks', 'Tc'],
      investments: { a: 10, b: 10 },
      pots: [{ amount: 20, winnerIds: ['a'] }],
      winnerIds: ['a'],
      payouts: { a: 20 },
      netChanges: { a: 10, b: -10 },
      revealedHoleCards: {
        a: ['Ah', 'Ad'],
        b: ['Qc', 'Jc'],
      },
    });

    expect(events).toEqual([]);
  });
});
