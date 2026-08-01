import { buildContributionTiers, type PlayerContribution } from './tiers.js';

export interface Pot {
  readonly amount: number;
  readonly contributorIds: readonly string[];
  readonly eligiblePlayerIds: readonly string[];
}

export function buildPots(
  contributions: readonly PlayerContribution[],
): readonly Pot[] {
  const folded = new Set(
    contributions
      .filter(({ folded: hasFolded }) => hasFolded)
      .map(({ playerId }) => playerId),
  );
  return Object.freeze(
    buildContributionTiers(contributions).map((tier) =>
      Object.freeze({
        amount: tier.amount,
        contributorIds: tier.contributorIds,
        eligiblePlayerIds: Object.freeze(
          tier.contributorIds.filter((playerId) => !folded.has(playerId)),
        ),
      }),
    ),
  );
}
