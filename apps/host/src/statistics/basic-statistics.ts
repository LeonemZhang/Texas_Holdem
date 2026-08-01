import type { HandSummaryEvent } from '@texas-holdem/poker-core';

export type RecordedPlayerAction =
  'fold' | 'check' | 'call' | 'raiseTo' | 'allIn';

export interface PlayerActionEvent {
  readonly type: 'player.action';
  readonly handId: string;
  readonly playerId: string;
  readonly action: RecordedPlayerAction;
}

export type BasicStatisticsEvent = HandSummaryEvent | PlayerActionEvent;

export interface ActionCounts {
  readonly fold: number;
  readonly check: number;
  readonly call: number;
  readonly raiseTo: number;
  readonly allIn: number;
}

export interface BasicPlayerStatistics {
  readonly playerId: string;
  readonly initialChips: number;
  readonly currentChips: number;
  readonly participatedHands: number;
  readonly wonHands: number;
  readonly actionCounts: ActionCounts;
  readonly largestWonPot: number;
}

function emptyStats(
  playerId: string,
  initialChips: number,
): BasicPlayerStatistics {
  if (!Number.isSafeInteger(initialChips) || initialChips < 0) {
    throw new RangeError(`Invalid initial chips for ${playerId}`);
  }
  return {
    playerId,
    initialChips,
    currentChips: initialChips,
    participatedHands: 0,
    wonHands: 0,
    actionCounts: { fold: 0, check: 0, call: 0, raiseTo: 0, allIn: 0 },
    largestWonPot: 0,
  };
}

function freezeStats(
  stats: Readonly<Record<string, BasicPlayerStatistics>>,
): Readonly<Record<string, BasicPlayerStatistics>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(stats).map(([playerId, player]) => [
        playerId,
        Object.freeze({
          ...player,
          actionCounts: Object.freeze({ ...player.actionCounts }),
        }),
      ]),
    ),
  );
}

export function reduceBasicStatistics(
  initialChipsByPlayer: Readonly<Record<string, number>>,
  events: readonly BasicStatisticsEvent[],
): Readonly<Record<string, BasicPlayerStatistics>> {
  const stats: Record<string, BasicPlayerStatistics> = Object.fromEntries(
    Object.entries(initialChipsByPlayer).map(([playerId, chips]) => [
      playerId,
      emptyStats(playerId, chips),
    ]),
  );

  for (const event of events) {
    if (event.type === 'player.action') {
      const player = stats[event.playerId];
      if (!player)
        throw new RangeError(`Statistics player not found: ${event.playerId}`);
      stats[event.playerId] = {
        ...player,
        actionCounts: {
          ...player.actionCounts,
          [event.action]: player.actionCounts[event.action] + 1,
        },
      };
      continue;
    }
    if (event.type !== 'hand.summary') {
      throw new RangeError('Unknown statistics event');
    }
    const winners = new Set(event.winnerIds);
    for (const { playerId } of event.participants) {
      const player = stats[playerId];
      if (!player)
        throw new RangeError(`Statistics player not found: ${playerId}`);
      const largestWonPot = event.pots
        .filter(({ winnerIds }) => winnerIds.includes(playerId))
        .reduce(
          (largest, pot) => Math.max(largest, pot.amount),
          player.largestWonPot,
        );
      stats[playerId] = {
        ...player,
        currentChips: player.currentChips + (event.netChanges[playerId] ?? 0),
        participatedHands: player.participatedHands + 1,
        wonHands: player.wonHands + (winners.has(playerId) ? 1 : 0),
        largestWonPot,
      };
    }
  }
  return freezeStats(stats);
}
