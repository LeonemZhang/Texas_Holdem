import { describe, expect, it } from 'vitest';

import { buildContributionTiers } from './tiers.js';

describe('buildContributionTiers', () => {
  it('creates one layer for every distinct positive investment level', () => {
    const tiers = buildContributionTiers([
      { playerId: 'a', amount: 100, folded: false },
      { playerId: 'b', amount: 50, folded: false },
      { playerId: 'c', amount: 100, folded: true },
    ]);
    expect(tiers).toEqual([
      {
        lowerExclusive: 0,
        upperInclusive: 50,
        amount: 150,
        contributorIds: ['a', 'b', 'c'],
      },
      {
        lowerExclusive: 50,
        upperInclusive: 100,
        amount: 100,
        contributorIds: ['a', 'c'],
      },
    ]);
  });

  it("keeps the tier sum equal to every player's total contribution", () => {
    const input = [
      { playerId: 'a', amount: 17, folded: false },
      { playerId: 'b', amount: 5, folded: false },
      { playerId: 'c', amount: 11, folded: false },
    ];
    const total = buildContributionTiers(input).reduce(
      (sum, tier) => sum + tier.amount,
      0,
    );
    expect(total).toBe(33);
  });

  it('rejects duplicate players and invalid amounts', () => {
    expect(() =>
      buildContributionTiers([
        { playerId: 'a', amount: 1, folded: false },
        { playerId: 'a', amount: 2, folded: false },
      ]),
    ).toThrow('Duplicate or empty player id: a');
    expect(() =>
      buildContributionTiers([{ playerId: 'a', amount: -1, folded: false }]),
    ).toThrow('Contribution must be a non-negative safe integer');
  });
});
