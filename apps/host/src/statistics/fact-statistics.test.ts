import { describe, expect, it } from 'vitest';

import { reduceFactStatistics } from './fact-statistics.js';

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
