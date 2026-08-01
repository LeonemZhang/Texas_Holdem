import type { HandSummaryEvent } from '@texas-holdem/poker-core';

export interface OutcomePlayerStatistics {
  readonly playerId: string;
  readonly showdownCount: number;
  readonly showdownWins: number;
  readonly showdownWinRate: number | null;
  readonly largestSingleHandProfit: number;
  readonly uncontestedWins: number;
}

export function reduceOutcomeStatistics(
  playerIds: readonly string[],
  summaries: readonly HandSummaryEvent[],
): Readonly<Record<string, OutcomePlayerStatistics>> {
  const mutable = Object.fromEntries(
    playerIds.map((playerId) => [
      playerId,
      {
        playerId,
        showdownCount: 0,
        showdownWins: 0,
        largestSingleHandProfit: 0,
        uncontestedWins: 0,
      },
    ]),
  );
  for (const summary of summaries) {
    const winners = new Set(summary.winnerIds);
    for (const { playerId } of summary.participants) {
      const current = mutable[playerId];
      if (!current)
        throw new RangeError(`Statistics player not found: ${playerId}`);
      const won = winners.has(playerId);
      mutable[playerId] = {
        ...current,
        showdownCount:
          current.showdownCount + (summary.reason === 'showdown' ? 1 : 0),
        showdownWins:
          current.showdownWins + (summary.reason === 'showdown' && won ? 1 : 0),
        largestSingleHandProfit: Math.max(
          current.largestSingleHandProfit,
          summary.netChanges[playerId] ?? 0,
        ),
        uncontestedWins:
          current.uncontestedWins +
          (summary.reason === 'uncontested' && won ? 1 : 0),
      };
    }
  }
  return Object.freeze(
    Object.fromEntries(
      Object.entries(mutable).map(([playerId, current]) => [
        playerId,
        Object.freeze({
          ...current,
          showdownWinRate:
            current.showdownCount === 0
              ? null
              : current.showdownWins / current.showdownCount,
        }),
      ]),
    ),
  );
}
