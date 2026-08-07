import { describe, expect, it } from 'vitest';

import { buildPots } from './pots.js';

describe('buildPots', () => {
  it('keeps folded chips in each pot but removes winner eligibility', () => {
    expect(
      buildPots([
        { playerId: 'a', amount: 100, folded: false },
        { playerId: 'b', amount: 50, folded: false },
        { playerId: 'c', amount: 100, folded: true },
      ]),
    ).toEqual([
      {
        amount: 150,
        contributorIds: ['a', 'b', 'c'],
        eligiblePlayerIds: ['a', 'b'],
      },
      {
        amount: 100,
        contributorIds: ['a', 'c'],
        eligiblePlayerIds: ['a'],
      },
    ]);
  });

  it('supports several all-in levels without losing contributions', () => {
    const pots = buildPots([
      { playerId: 'a', amount: 20, folded: false },
      { playerId: 'b', amount: 50, folded: false },
      { playerId: 'c', amount: 100, folded: false },
      { playerId: 'd', amount: 100, folded: true },
    ]);
    expect(pots.map(({ amount }) => amount)).toEqual([80, 90, 100]);
    expect(pots.reduce((sum, pot) => sum + pot.amount, 0)).toBe(270);
    expect(pots[2]?.eligiblePlayerIds).toEqual(['c']);
  });

  it('marks an unmatched all-in layer as a refund instead of a won side pot', () => {
    const pots = buildPots([
      { playerId: 'a', amount: 100, folded: false },
      { playerId: 'b', amount: 200, folded: false },
    ]);

    expect(pots).toEqual([
      {
        amount: 200,
        contributorIds: ['a', 'b'],
        eligiblePlayerIds: ['a', 'b'],
      },
      {
        amount: 100,
        contributorIds: ['b'],
        eligiblePlayerIds: ['b'],
        unmatchedPlayerId: 'b',
      },
    ]);
  });

  it('marks an unmatched folded layer as a refund too', () => {
    expect(
      buildPots([
        { playerId: 'a', amount: 100, folded: false },
        { playerId: 'b', amount: 200, folded: true },
      ]),
    ).toEqual([
      {
        amount: 200,
        contributorIds: ['a', 'b'],
        eligiblePlayerIds: ['a'],
      },
      {
        amount: 100,
        contributorIds: ['b'],
        eligiblePlayerIds: [],
        unmatchedPlayerId: 'b',
      },
    ]);
  });
});
