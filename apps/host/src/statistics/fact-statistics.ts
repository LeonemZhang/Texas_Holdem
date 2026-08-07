import {
  compareHandRanks,
  findBestAvailableFiveCardHand,
  parseCard,
  type HandSummaryEvent,
} from '@texas-holdem/poker-core';

import type { PlayerActionEvent } from './basic-statistics.js';

export interface HeadsUpShowdownLossEvent {
  readonly type: 'showdown.heads-up-loss';
  readonly handId: string;
  readonly loserPlayerId: string;
  readonly winnerPlayerId: string;
  readonly contenderCount: 2;
}

export interface RiverComebackEvent {
  readonly type: 'showdown.river-comeback';
  readonly handId: string;
  readonly winnerPlayerId: string;
  readonly leadersBeforeRiver: readonly string[];
}

export type StatisticsFactEvent =
  PlayerActionEvent | HeadsUpShowdownLossEvent | RiverComebackEvent;

export function createRiverComebackEvents(
  summary: HandSummaryEvent,
): readonly RiverComebackEvent[] {
  if (
    summary.reason !== 'showdown' ||
    summary.communityCards.length !== 5 ||
    summary.winnerIds.length === 0
  ) {
    return [];
  }

  const boardBeforeRiver = summary.communityCards.slice(0, 4).map(parseCard);
  const rankedPlayers = summary.participants.flatMap(({ playerId }) => {
    const holeCards = summary.revealedHoleCards[playerId];
    if (!holeCards || holeCards.length !== 2) return [];
    return [
      {
        playerId,
        rank: findBestAvailableFiveCardHand([
          ...holeCards.map(parseCard),
          ...boardBeforeRiver,
        ]).rank,
      },
    ];
  });
  if (rankedPlayers.length < 2) return [];

  const leadingRank = rankedPlayers.reduce(
    (current, candidate) =>
      compareHandRanks(candidate.rank, current) > 0 ? candidate.rank : current,
    rankedPlayers[0]!.rank,
  );
  const leadersBeforeRiver = rankedPlayers
    .filter(({ rank }) => compareHandRanks(rank, leadingRank) === 0)
    .map(({ playerId }) => playerId);

  return summary.winnerIds
    .filter(
      (playerId) =>
        rankedPlayers.some((player) => player.playerId === playerId) &&
        !leadersBeforeRiver.includes(playerId),
    )
    .map((winnerPlayerId) => ({
      type: 'showdown.river-comeback' as const,
      handId: summary.handId,
      winnerPlayerId,
      leadersBeforeRiver,
    }));
}

export interface FactPlayerStatistics {
  readonly playerId: string;
  readonly allInCount: number;
  readonly headsUpShowdownLosses: number;
  readonly riverComebackWins: number;
}

export function reduceFactStatistics(
  playerIds: readonly string[],
  events: readonly StatisticsFactEvent[],
): Readonly<Record<string, FactPlayerStatistics>> {
  const known = new Set(playerIds);
  const stats: Record<string, FactPlayerStatistics> = Object.fromEntries(
    playerIds.map((playerId) => [
      playerId,
      {
        playerId,
        allInCount: 0,
        headsUpShowdownLosses: 0,
        riverComebackWins: 0,
      },
    ]),
  );
  const increment = (
    playerId: string,
    field: Exclude<keyof FactPlayerStatistics, 'playerId'>,
  ) => {
    const current = stats[playerId];
    if (!current)
      throw new RangeError(`Statistics player not found: ${playerId}`);
    stats[playerId] = { ...current, [field]: current[field] + 1 };
  };

  for (const event of events) {
    if (event.type === 'player.action') {
      if (!known.has(event.playerId)) {
        throw new RangeError(`Statistics player not found: ${event.playerId}`);
      }
      if (event.action === 'allIn') increment(event.playerId, 'allInCount');
    } else if (event.type === 'showdown.heads-up-loss') {
      if (event.loserPlayerId === event.winnerPlayerId) {
        throw new RangeError('Heads-up loser and winner must differ');
      }
      if (!known.has(event.winnerPlayerId)) {
        throw new RangeError(
          `Statistics player not found: ${event.winnerPlayerId}`,
        );
      }
      increment(event.loserPlayerId, 'headsUpShowdownLosses');
    } else {
      if (event.leadersBeforeRiver.includes(event.winnerPlayerId)) {
        throw new RangeError('River comeback winner was already leading');
      }
      increment(event.winnerPlayerId, 'riverComebackWins');
    }
  }
  return Object.freeze(
    Object.fromEntries(
      Object.entries(stats).map(([playerId, player]) => [
        playerId,
        Object.freeze(player),
      ]),
    ),
  );
}
