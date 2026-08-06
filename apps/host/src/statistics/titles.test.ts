import { describe, expect, it } from 'vitest';

import type { BasicPlayerStatistics } from './basic-statistics.js';
import type { FactPlayerStatistics } from './fact-statistics.js';
import type { OutcomePlayerStatistics } from './outcome-statistics.js';
import { computeFunTitles } from './titles.js';

function basic(
  playerId: string,
  overrides: Partial<BasicPlayerStatistics> = {},
): BasicPlayerStatistics {
  return {
    playerId,
    initialChips: 100,
    currentChips: 100,
    netWinLoss: 0,
    participatedHands: 10,
    wonHands: 0,
    actionCounts: { fold: 0, check: 0, call: 0, raiseTo: 0, allIn: 0 },
    totalWonPotChips: 0,
    preflopFoldCount: 0,
    ...overrides,
  };
}

function outcome(
  playerId: string,
  overrides: Partial<OutcomePlayerStatistics> = {},
): OutcomePlayerStatistics {
  return {
    playerId,
    showdownCount: 0,
    showdownWins: 0,
    showdownWinRate: null,
    largestSingleHandProfit: 0,
    largestSingleHandLoss: 0,
    uncontestedWins: 0,
    ...overrides,
  };
}

function fact(
  playerId: string,
  overrides: Partial<FactPlayerStatistics> = {},
): FactPlayerStatistics {
  return {
    playerId,
    allInCount: 0,
    headsUpShowdownLosses: 0,
    riverComebackWins: 0,
    ...overrides,
  };
}

describe('computeFunTitles', () => {
  it('computes all seven documented titles', () => {
    const titles = computeFunTitles(
      {
        a: basic('a', { totalWonPotChips: 200, preflopFoldCount: 8 }),
        b: basic('b', { totalWonPotChips: 300, preflopFoldCount: 2 }),
      },
      {
        a: outcome('a', {
          largestSingleHandProfit: 80,
          uncontestedWins: 3,
        }),
        b: outcome('b', {
          largestSingleHandProfit: 50,
          uncontestedWins: 1,
        }),
      },
      {
        a: fact('a', { allInCount: 4, headsUpShowdownLosses: 2 }),
        b: fact('b', { allInCount: 2, riverComebackWins: 3 }),
      },
    );
    expect(titles).toHaveLength(7);
    expect(
      Object.fromEntries(titles.map((title) => [title.title, title.playerIds])),
    ).toEqual({
      'all-in-king': ['a'],
      'unlucky-player': ['a'],
      'pot-harvester': ['b'],
      'double-up-master': ['a'],
      'bluff-king': ['a'],
      'river-killer': ['b'],
      'tight-player': ['a'],
    });
  });

  it('allows multiple players to share the same title', () => {
    const titles = computeFunTitles(
      {
        a: basic('a', { totalWonPotChips: 100 }),
        b: basic('b', { totalWonPotChips: 100 }),
      },
      { a: outcome('a'), b: outcome('b') },
      {
        a: fact('a', { allInCount: 2 }),
        b: fact('b', { allInCount: 2 }),
      },
    );
    expect(
      titles.find(({ title }) => title === 'all-in-king')?.playerIds,
    ).toEqual(['a', 'b']);
    expect(
      titles.find(({ title }) => title === 'pot-harvester')?.playerIds,
    ).toEqual(['a', 'b']);
  });

  it('enforces the minimum sample for the tight-player title', () => {
    const titles = computeFunTitles(
      {
        a: basic('a', { participatedHands: 9, preflopFoldCount: 9 }),
        b: basic('b', { participatedHands: 10, preflopFoldCount: 5 }),
      },
      { a: outcome('a'), b: outcome('b') },
      { a: fact('a'), b: fact('b') },
      10,
    );
    expect(
      titles.find(({ title }) => title === 'tight-player')?.playerIds,
    ).toEqual(['b']);
  });
});
