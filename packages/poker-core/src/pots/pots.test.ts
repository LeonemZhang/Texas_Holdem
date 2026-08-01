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
});
