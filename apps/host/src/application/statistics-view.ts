import { HAND_CATEGORY } from '@texas-holdem/poker-core';
import {
  RoomRecordStatisticsSchema,
  type RoomRecordStatistics,
} from '@texas-holdem/protocol';

import { isVisibleStatisticsPlayer, type RoomState } from '../domain/room.js';
import type { RebuiltStatistics } from './statistics-store.js';

const handTypes = {
  [HAND_CATEGORY.HIGH_CARD]: 'high-card',
  [HAND_CATEGORY.ONE_PAIR]: 'one-pair',
  [HAND_CATEGORY.TWO_PAIR]: 'two-pair',
  [HAND_CATEGORY.THREE_OF_A_KIND]: 'three-of-a-kind',
  [HAND_CATEGORY.STRAIGHT]: 'straight',
  [HAND_CATEGORY.FLUSH]: 'flush',
  [HAND_CATEGORY.FULL_HOUSE]: 'full-house',
  [HAND_CATEGORY.FOUR_OF_A_KIND]: 'four-of-a-kind',
  [HAND_CATEGORY.STRAIGHT_FLUSH]: 'straight-flush',
} as const;

export function createStatisticsView(
  room: RoomState,
  rebuilt: RebuiltStatistics,
): RoomRecordStatistics {
  const visiblePlayers = room.players.filter(isVisibleStatisticsPlayer);
  const visiblePlayerIds = new Set(
    visiblePlayers.map(({ playerId }) => playerId),
  );
  const visibleTitles = rebuilt.titles.flatMap((title) => {
    const playerIds = title.playerIds.filter((playerId) =>
      visiblePlayerIds.has(playerId),
    );
    return playerIds.length > 0 ? [{ ...title, playerIds }] : [];
  });
  const visibleGlobal = rebuilt.handPeaks.global
    ? {
        ...rebuilt.handPeaks.global,
        playerIds: rebuilt.handPeaks.global.playerIds.filter((playerId) =>
          visiblePlayerIds.has(playerId),
        ),
      }
    : null;
  return RoomRecordStatisticsSchema.parse({
    players: visiblePlayers.map((player) => ({
      playerId: player.playerId,
      nickname: player.nickname,
      removed: player.status === 'removed',
      initialChips: room.settings.initialChips,
      currentChips: player.chips,
      netWinLoss: rebuilt.basic[player.playerId]?.netWinLoss ?? 0,
      participatedHands: rebuilt.basic[player.playerId]?.participatedHands ?? 0,
      wonHands: rebuilt.basic[player.playerId]?.wonHands ?? 0,
      largestSingleHandProfit:
        rebuilt.outcomes[player.playerId]?.largestSingleHandProfit ?? 0,
      largestSingleHandLoss:
        rebuilt.outcomes[player.playerId]?.largestSingleHandLoss ?? 0,
      showdownCount: rebuilt.outcomes[player.playerId]?.showdownCount ?? 0,
      showdownWinRate:
        rebuilt.outcomes[player.playerId]?.showdownWinRate ?? null,
      actions: rebuilt.basic[player.playerId]?.actionCounts ?? {
        fold: 0,
        check: 0,
        call: 0,
        raiseTo: 0,
        allIn: 0,
      },
    })),
    titles: visibleTitles,
    handPeaks: {
      global:
        visibleGlobal && visibleGlobal.playerIds.length > 0
          ? {
              playerIds: visibleGlobal.playerIds,
              handType: handTypes[visibleGlobal.rank[0]],
              bestFiveCards: visibleGlobal.bestFiveCards,
            }
          : null,
      players: visiblePlayers.flatMap((player) => {
        const peak = rebuilt.handPeaks.players[player.playerId];
        return peak
          ? [
              {
                playerId: player.playerId,
                handType: handTypes[peak.rank[0]],
                bestFiveCards: peak.bestFiveCards,
              },
            ]
          : [];
      }),
      hasLegacyCoverageGap: rebuilt.handPeaks.hasLegacyCoverageGap,
    },
  });
}
