import {
  HAND_CATEGORY,
  actionOrderForStreet,
  formatCard,
  legalBettingActions,
  type StartedHandState,
  type ShowdownSettledHand,
  type UncontestedSettledHand,
} from '@texas-holdem/poker-core';
import {
  PlayerSnapshotSchema,
  PROTOCOL_VERSION,
  type ChipActivity,
  type PlayerSnapshot,
} from '@texas-holdem/protocol';

import type { ChipRequestBook } from '../domain/chip-requests.js';
import type { HandReadyState } from '../domain/hand-ready.js';
import type { RoomPlayer, RoomState } from '../domain/room.js';

export interface SnapshotPlayerStatistics {
  readonly playerId: string;
  readonly currentChips: number;
  readonly netWinLoss: number;
  readonly participatedHands: number;
  readonly wonHands: number;
  readonly largestSingleHandProfit: number;
  readonly largestSingleHandLoss: number;
  readonly showdownCount: number;
  readonly showdownWinRate: number | null;
  readonly actions: {
    readonly fold: number;
    readonly check: number;
    readonly call: number;
    readonly raiseTo: number;
    readonly allIn: number;
  };
}

export interface SnapshotHandPeaks {
  readonly global: {
    readonly playerIds: readonly string[];
    readonly handType: (typeof handTypeByCategory)[keyof typeof handTypeByCategory];
    readonly bestFiveCards: readonly string[];
  } | null;
  readonly players: readonly {
    readonly playerId: string;
    readonly handType: (typeof handTypeByCategory)[keyof typeof handTypeByCategory];
    readonly bestFiveCards: readonly string[];
  }[];
  readonly hasLegacyCoverageGap: boolean;
}

const handTypeByCategory = {
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

export interface SnapshotProjectionInput {
  readonly room: RoomState;
  readonly viewerPlayerId: string;
  readonly sequence: number;
  readonly completedHands?: number;
  readonly hand?: StartedHandState | null;
  readonly actionDeadlineMs?: number | null;
  readonly handReady?: HandReadyState | null;
  readonly chipRequests?: ChipRequestBook | null;
  readonly chipActivity?: readonly ChipActivity[];
  readonly statistics?: readonly SnapshotPlayerStatistics[];
  readonly titles?: readonly {
    readonly title: string;
    readonly playerIds: readonly string[];
    readonly value: number | null;
  }[];
  readonly handPeaks?: SnapshotHandPeaks;
}

function handPlayer(
  hand: StartedHandState | null,
  playerId: string,
): StartedHandState['players'][number] | undefined {
  return hand?.players.find((player) => player.playerId === playerId);
}

function publicStatus(
  roomPlayer: RoomPlayer,
  hand: StartedHandState | null,
): PlayerSnapshot['room']['players'][number]['status'] {
  if (roomPlayer.status !== 'active') return roomPlayer.status;
  return handPlayer(hand, roomPlayer.playerId)?.status ?? roomPlayer.status;
}

function isShowdownSettledHand(
  hand: StartedHandState,
): hand is ShowdownSettledHand {
  return (
    'settlement' in hand &&
    (hand as ShowdownSettledHand).settlement.reason === 'showdown'
  );
}

function isSettledHand(
  hand: StartedHandState,
): hand is ShowdownSettledHand | UncontestedSettledHand {
  return 'settlement' in hand;
}

function showdownHoleCards(
  hand: StartedHandState | null,
): Readonly<Record<string, readonly string[]>> {
  if (!hand || !isShowdownSettledHand(hand)) return Object.freeze({});
  return Object.freeze(
    Object.fromEntries(
      Object.entries(hand.settlement.revealedHoleCards).map(
        ([playerId, cards]) => [playerId, Object.freeze(cards.map(formatCard))],
      ),
    ),
  );
}

function settlementSummary(
  hand: StartedHandState | null,
  voluntarilyRevealedHoleCardPlayerIds: readonly string[],
): {
  readonly reason: 'uncontested' | 'showdown';
  readonly winnerIds: readonly string[];
  readonly payouts: Readonly<Record<string, number>>;
  readonly netChanges: Readonly<Record<string, number>>;
  readonly showdownResults: readonly {
    readonly playerId: string;
    readonly handType: (typeof handTypeByCategory)[keyof typeof handTypeByCategory];
    readonly bestFiveCards: readonly string[];
  }[];
  readonly voluntaryRevealedHoleCards: Readonly<
    Record<string, readonly string[]>
  >;
} | null {
  if (!hand || !isSettledHand(hand)) return null;
  const netChanges = Object.fromEntries(
    hand.players.map((player) => [
      player.playerId,
      (hand.settlement.payouts[player.playerId] ?? 0) - player.totalCommitted,
    ]),
  );
  const showdownResults = isShowdownSettledHand(hand)
    ? Object.entries(hand.settlement.bestHands ?? {}).map(
        ([playerId, best]) => ({
          playerId,
          handType: handTypeByCategory[best.rank[0]],
          bestFiveCards: best.cards.map(formatCard),
        }),
      )
    : [];
  const voluntaryRevealedHoleCards = Object.fromEntries(
    voluntarilyRevealedHoleCardPlayerIds.flatMap((playerId) => {
      const player = hand.players.find(
        (candidate) => candidate.playerId === playerId,
      );
      return player
        ? [[playerId, player.holeCards.map(formatCard)] as const]
        : [];
    }),
  );
  return {
    reason: hand.settlement.reason,
    winnerIds: hand.settlement.winnerIds,
    payouts: hand.settlement.payouts,
    netChanges,
    showdownResults,
    voluntaryRevealedHoleCards,
  };
}

function actionOrderByPlayerId(
  hand: StartedHandState | null,
): ReadonlyMap<string, number> {
  if (!hand) return new Map();
  return new Map(
    actionOrderForStreet(
      hand.players.map(({ playerId, seatIndex }) => ({
        playerId,
        index: seatIndex,
        status: 'active' as const,
      })),
      hand.positions,
      hand.street,
    ).map(({ playerId }, index) => [playerId, index + 1]),
  );
}

function streetPotHistory(hand: StartedHandState) {
  const completed = hand.completedStreetPots ?? [];
  const currentStreetAmount = hand.players.reduce(
    (total, player) => total + player.streetCommitted,
    0,
  );
  return [
    ...completed.filter(({ street }) => street !== hand.street),
    { street: hand.street, amount: currentStreetAmount },
  ];
}

function totalPotAmount(hand: StartedHandState): number {
  return hand.players.reduce(
    (total, player) => total + player.totalCommitted,
    0,
  );
}

export function projectPlayerSnapshot(
  input: SnapshotProjectionInput,
): PlayerSnapshot {
  const viewer = input.room.players.find(
    ({ playerId }) => playerId === input.viewerPlayerId,
  );
  if (!viewer) {
    throw new RangeError(
      `Snapshot viewer is not in room: ${input.viewerPlayerId}`,
    );
  }
  const hand = input.hand ?? null;
  const ready = input.handReady ?? null;
  const requests = input.chipRequests ?? null;
  const currentViewer = handPlayer(hand, input.viewerPlayerId);
  const actionOrder = actionOrderByPlayerId(hand);
  const currentChips = (player: RoomPlayer) => player.chips;
  const statistics =
    input.statistics ??
    input.room.players.map((player) => ({
      playerId: player.playerId,
      currentChips: currentChips(player),
      netWinLoss: 0,
      participatedHands: 0,
      wonHands: 0,
      largestSingleHandProfit: 0,
      largestSingleHandLoss: 0,
      showdownCount: 0,
      showdownWinRate: null,
      actions: { fold: 0, check: 0, call: 0, raiseTo: 0, allIn: 0 },
    }));

  return PlayerSnapshotSchema.parse({
    protocolVersion: PROTOCOL_VERSION,
    roomId: input.room.roomId,
    playerId: input.viewerPlayerId,
    sequence: input.sequence,
    stateVersion: input.room.version,
    room: {
      roomName: input.room.settings.roomName,
      phase: input.room.phase,
      initialChips: input.room.settings.initialChips,
      smallBlind: input.room.settings.smallBlind,
      bigBlind: input.room.settings.bigBlind,
      completedHands: input.completedHands ?? 0,
      players: input.room.players.map((player) => ({
        playerId: player.playerId,
        nickname: player.nickname,
        seatIndex: player.seatIndex,
        chips: currentChips(player),
        streetCommitted:
          handPlayer(hand, player.playerId)?.streetCommitted ?? 0,
        totalCommitted: handPlayer(hand, player.playerId)?.totalCommitted ?? 0,
        actionOrder: actionOrder.get(player.playerId) ?? null,
        lastAction: handPlayer(hand, player.playerId)?.lastAction ?? null,
        status: publicStatus(player, hand),
        isHost: player.playerId === input.room.hostPlayerId,
        lobbyReady: player.lobbyReady,
      })),
    },
    game: hand
      ? {
          handId: hand.handId,
          street: hand.street,
          buttonPlayerId: hand.positions.button.playerId,
          smallBlindPlayerId: hand.positions.smallBlind.playerId,
          bigBlindPlayerId: hand.positions.bigBlind.playerId,
          currentActorId: hand.betting.currentActorId,
          actionDeadlineMs: input.actionDeadlineMs ?? null,
          communityCards: hand.communityCards.map(formatCard),
          totalPot: totalPotAmount(hand),
          streetPots: streetPotHistory(hand),
          ownHoleCards: currentViewer
            ? currentViewer.holeCards.map(formatCard)
            : null,
          showdownHoleCards: showdownHoleCards(hand),
          settlement: settlementSummary(
            hand,
            input.room.voluntarilyRevealedHoleCardPlayerIds,
          ),
          legalActions:
            viewer.status === 'active' &&
            hand.betting.currentActorId === input.viewerPlayerId
              ? legalBettingActions(hand.betting, input.viewerPlayerId)
              : null,
        }
      : null,
    handReady: ready
      ? {
          deadlineMs: ready.deadlineMs,
          ownChoice:
            ready.players.find(
              ({ playerId }) => playerId === input.viewerPlayerId,
            )?.choice ?? 'sitting-out',
          pendingRequests: (requests?.requests ?? [])
            .filter(({ status }) => status === 'pending')
            .map(
              ({
                requestId,
                requesterId,
                targetPlayerId,
                amount,
                status,
                rejectedByPlayerIds,
              }) => ({
                requestId,
                requesterId,
                targetPlayerId,
                amount,
                status,
                rejectedByPlayerIds,
              }),
            ),
        }
      : null,
    chipRequests: (requests?.requests ?? [])
      .filter(({ status }) => status === 'pending')
      .map(
        ({
          requestId,
          requesterId,
          targetPlayerId,
          amount,
          status,
          rejectedByPlayerIds,
        }) => ({
          requestId,
          requesterId,
          targetPlayerId,
          amount,
          status,
          rejectedByPlayerIds,
        }),
      ),
    chipActivity: [...(input.chipActivity ?? [])].sort(
      (left, right) =>
        (right.kind === 'request'
          ? right.updatedSequence
          : right.completedSequence) -
        (left.kind === 'request'
          ? left.updatedSequence
          : left.completedSequence),
    ),
    statistics: {
      players: statistics,
      titles: input.titles ?? [],
      handPeaks: input.handPeaks ?? {
        global: null,
        players: [],
        hasLegacyCoverageGap: false,
      },
    },
  });
}
