import type { BasicPlayerStatistics } from './basic-statistics.js';
import type { FactPlayerStatistics } from './fact-statistics.js';
import type { OutcomePlayerStatistics } from './outcome-statistics.js';

export type FunTitle =
  | 'all-in-king'
  | 'unlucky-player'
  | 'pot-harvester'
  | 'double-up-master'
  | 'bluff-king'
  | 'river-killer'
  | 'tight-player';

export interface TitleAward {
  readonly title: FunTitle;
  readonly playerIds: readonly string[];
  readonly value: number | null;
}

function awardMaximum(
  title: FunTitle,
  values: readonly { readonly playerId: string; readonly value: number }[],
): TitleAward {
  const maximum = values.reduce(
    (current, candidate) => Math.max(current, candidate.value),
    0,
  );
  return Object.freeze({
    title,
    playerIds: Object.freeze(
      maximum === 0
        ? []
        : values
            .filter(({ value }) => value === maximum)
            .map(({ playerId }) => playerId),
    ),
    value: maximum === 0 ? null : maximum,
  });
}

export function computeFunTitles(
  basic: Readonly<Record<string, BasicPlayerStatistics>>,
  outcomes: Readonly<Record<string, OutcomePlayerStatistics>>,
  facts: Readonly<Record<string, FactPlayerStatistics>>,
  minimumHandsForTightTitle = 10,
): readonly TitleAward[] {
  if (
    !Number.isSafeInteger(minimumHandsForTightTitle) ||
    minimumHandsForTightTitle <= 0
  ) {
    throw new RangeError('Minimum hands for tight title must be positive');
  }
  const players = Object.values(basic);
  const factValues = (field: keyof Omit<FactPlayerStatistics, 'playerId'>) =>
    players.map(({ playerId }) => ({
      playerId,
      value: facts[playerId]?.[field] ?? 0,
    }));
  const outcomeValues = (
    field: keyof Omit<OutcomePlayerStatistics, 'playerId' | 'showdownWinRate'>,
  ) =>
    players.map(({ playerId }) => ({
      playerId,
      value: outcomes[playerId]?.[field] ?? 0,
    }));
  const tightCandidates = players
    .filter(
      ({ participatedHands }) => participatedHands >= minimumHandsForTightTitle,
    )
    .map(({ playerId, participatedHands, preflopFoldCount }) => ({
      playerId,
      value: preflopFoldCount / participatedHands,
    }));

  return Object.freeze([
    awardMaximum('all-in-king', factValues('allInCount')),
    awardMaximum('unlucky-player', factValues('headsUpShowdownLosses')),
    awardMaximum(
      'pot-harvester',
      players.map(({ playerId, totalWonPotChips: value }) => ({
        playerId,
        value,
      })),
    ),
    awardMaximum('double-up-master', outcomeValues('largestSingleHandProfit')),
    awardMaximum('bluff-king', outcomeValues('uncontestedWins')),
    awardMaximum('river-killer', factValues('riverComebackWins')),
    awardMaximum('tight-player', tightCandidates),
  ]);
}
