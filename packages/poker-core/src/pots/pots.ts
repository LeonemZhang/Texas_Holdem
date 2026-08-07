import { buildContributionTiers, type PlayerContribution } from './tiers.js';

export interface Pot {
  readonly amount: number;
  readonly contributorIds: readonly string[];
  readonly eligiblePlayerIds: readonly string[];
  /** A single contributor's excess is returned, not won, even if folded. */
  readonly unmatchedPlayerId?: string;
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
    buildContributionTiers(contributions).map((tier) => {
      const eligiblePlayerIds = tier.contributorIds.filter(
        (playerId) => !folded.has(playerId),
      );
      const unmatchedPlayerId =
        tier.contributorIds.length === 1 ? tier.contributorIds[0] : undefined;
      return Object.freeze({
        amount: tier.amount,
        contributorIds: tier.contributorIds,
        eligiblePlayerIds: Object.freeze(eligiblePlayerIds),
        ...(unmatchedPlayerId ? { unmatchedPlayerId } : {}),
      });
    }),
  );
}
