export interface PlayerContribution {
  readonly playerId: string;
  readonly amount: number;
  readonly folded: boolean;
}

export interface ContributionTier {
  readonly lowerExclusive: number;
  readonly upperInclusive: number;
  readonly amount: number;
  readonly contributorIds: readonly string[];
}

export function assertContributions(
  contributions: readonly PlayerContribution[],
): void {
  const players = new Set<string>();
  for (const contribution of contributions) {
    if (!contribution.playerId || players.has(contribution.playerId)) {
      throw new RangeError(
        `Duplicate or empty player id: ${contribution.playerId}`,
      );
    }
    if (!Number.isSafeInteger(contribution.amount) || contribution.amount < 0) {
      throw new RangeError('Contribution must be a non-negative safe integer');
    }
    players.add(contribution.playerId);
  }
}

export function buildContributionTiers(
  contributions: readonly PlayerContribution[],
): readonly ContributionTier[] {
  assertContributions(contributions);
  const levels = [...new Set(contributions.map(({ amount }) => amount))]
    .filter((amount) => amount > 0)
    .sort((a, b) => a - b);
  let lower = 0;
  const tiers = levels.map((upper) => {
    const contributorIds = contributions
      .filter(({ amount }) => amount >= upper)
      .map(({ playerId }) => playerId);
    const tier = Object.freeze({
      lowerExclusive: lower,
      upperInclusive: upper,
      amount: (upper - lower) * contributorIds.length,
      contributorIds: Object.freeze(contributorIds),
    });
    lower = upper;
    return tier;
  });
  return Object.freeze(tiers);
}
