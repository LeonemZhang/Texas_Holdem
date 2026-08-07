import {
  compareHandRanks,
  type CardCode,
  type HandRank,
  type HandSummaryEvent,
} from '@texas-holdem/poker-core';

export interface HandPeak {
  readonly handId: string;
  readonly rank: HandRank;
  readonly bestFiveCards: readonly CardCode[];
}

export interface HandPeakStatistics {
  readonly players: Readonly<Record<string, HandPeak | null>>;
  readonly global:
    (HandPeak & { readonly playerIds: readonly string[] }) | null;
  readonly hasLegacyCoverageGap: boolean;
}

export function reduceHandPeakStatistics(
  playerIds: readonly string[],
  summaries: readonly HandSummaryEvent[],
): HandPeakStatistics {
  const players: Record<string, HandPeak | null> = Object.fromEntries(
    playerIds.map((playerId) => [playerId, null]),
  );
  let hasLegacyCoverageGap = false;
  for (const summary of summaries) {
    if (summary.reason === 'uncontested') continue;
    if (!summary.evaluatedHands) {
      hasLegacyCoverageGap = true;
      continue;
    }
    for (const [playerId, evaluated] of Object.entries(
      summary.evaluatedHands,
    )) {
      const current = players[playerId];
      if (!current || compareHandRanks(evaluated.rank, current.rank) > 0) {
        players[playerId] = Object.freeze({
          handId: summary.handId,
          rank: evaluated.rank,
          bestFiveCards: evaluated.bestFiveCards,
        });
      }
    }
  }
  const peakEntries = Object.entries(players).flatMap(([playerId, peak]) =>
    peak ? [{ playerId, peak }] : [],
  );
  let global: HandPeakStatistics['global'] = null;
  for (const { playerId, peak } of peakEntries) {
    if (!global || compareHandRanks(peak.rank, global.rank) > 0) {
      global = Object.freeze({ ...peak, playerIds: Object.freeze([playerId]) });
    } else if (global && compareHandRanks(peak.rank, global.rank) === 0) {
      const current: HandPeak & { readonly playerIds: readonly string[] } =
        global;
      global = Object.freeze({
        ...current,
        playerIds: Object.freeze([...current.playerIds, playerId]),
      });
    }
  }
  return Object.freeze({
    players: Object.freeze(players),
    global,
    hasLegacyCoverageGap,
  });
}
