import type { HandSummaryEvent } from '@texas-holdem/poker-core';

import {
  reduceBasicStatistics,
  type BasicPlayerStatistics,
} from '../statistics/basic-statistics.js';
import {
  reduceFactStatistics,
  type FactPlayerStatistics,
  type StatisticsFactEvent,
} from '../statistics/fact-statistics.js';
import {
  reduceOutcomeStatistics,
  type OutcomePlayerStatistics,
} from '../statistics/outcome-statistics.js';
import { computeFunTitles, type TitleAward } from '../statistics/titles.js';
import {
  reduceHandPeakStatistics,
  type HandPeakStatistics,
} from '../statistics/hand-peak-statistics.js';

export interface StoredStatisticsFact {
  readonly factId: string;
  readonly event: StatisticsFactEvent;
}

export interface StatisticsFactStorePort {
  saveSummary(
    roomId: string,
    sequence: number,
    summary: HandSummaryEvent,
    createdAtMs: number,
  ): void;
  updateSummary(roomId: string, summary: HandSummaryEvent): void;
  saveFacts(
    roomId: string,
    facts: readonly StoredStatisticsFact[],
    createdAtMs: number,
  ): void;
  loadSummaries(roomId: string): readonly HandSummaryEvent[];
  loadFacts(roomId: string): readonly StatisticsFactEvent[];
}

export interface RebuiltStatistics {
  readonly basic: Readonly<Record<string, BasicPlayerStatistics>>;
  readonly outcomes: Readonly<Record<string, OutcomePlayerStatistics>>;
  readonly facts: Readonly<Record<string, FactPlayerStatistics>>;
  readonly titles: readonly TitleAward[];
  readonly handPeaks: HandPeakStatistics;
}

export function rebuildStatistics(
  store: StatisticsFactStorePort,
  roomId: string,
  initialChipsByPlayer: Readonly<Record<string, number>>,
): RebuiltStatistics {
  const summaries = store.loadSummaries(roomId);
  const facts = store.loadFacts(roomId);
  const playerIds = Object.keys(initialChipsByPlayer);
  const basic = reduceBasicStatistics(initialChipsByPlayer, [
    ...summaries,
    ...facts.filter((event) => event.type === 'player.action'),
  ]);
  const outcomes = reduceOutcomeStatistics(playerIds, summaries);
  const factStatistics = reduceFactStatistics(playerIds, facts);
  return Object.freeze({
    basic,
    outcomes,
    facts: factStatistics,
    titles: computeFunTitles(basic, outcomes, factStatistics),
    handPeaks: reduceHandPeakStatistics(playerIds, summaries),
  });
}
