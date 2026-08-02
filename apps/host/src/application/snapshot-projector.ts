import {
  buildPots,
  formatCard,
  legalBettingActions,
  type StartedHandState,
  type ShowdownSettledHand,
} from '@texas-holdem/poker-core';
import {
  PlayerSnapshotSchema,
  PROTOCOL_VERSION,
  type PlayerSnapshot,
} from '@texas-holdem/protocol';

import type { ChipRequestBook } from '../domain/chip-requests.js';
import type { HandReadyState } from '../domain/hand-ready.js';
import type { RoomPlayer, RoomState } from '../domain/room.js';
import type { TitleAward } from '../statistics/titles.js';

export interface SnapshotPlayerStatistics {
  readonly playerId: string;
  readonly currentChips: number;
  readonly participatedHands: number;
  readonly wonHands: number;
  readonly largestSingleHandProfit: number;
  readonly largestWonPot: number;
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

export interface SnapshotProjectionInput {
  readonly room: RoomState;
  readonly viewerPlayerId: string;
  readonly sequence: number;
  readonly completedHands?: number;
  readonly hand?: StartedHandState | null;
  readonly actionDeadlineMs?: number | null;
  readonly handReady?: HandReadyState | null;
  readonly chipRequests?: ChipRequestBook | null;
  readonly statistics?: readonly SnapshotPlayerStatistics[];
  readonly titles?: readonly TitleAward[];
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
  const currentChips = (player: RoomPlayer) =>
    handPlayer(hand, player.playerId)?.stack ?? player.chips;
  const statistics =
    input.statistics ??
    input.room.players.map((player) => ({
      playerId: player.playerId,
      currentChips: currentChips(player),
      participatedHands: 0,
      wonHands: 0,
      largestSingleHandProfit: 0,
      largestWonPot: 0,
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
          pots: buildPots(
            hand.players.map((player) => ({
              playerId: player.playerId,
              amount: player.totalCommitted,
              folded: player.status === 'folded',
            })),
          ).map(({ amount, eligiblePlayerIds }) => ({
            amount,
            eligiblePlayerIds,
          })),
          ownHoleCards: currentViewer
            ? currentViewer.holeCards.map(formatCard)
            : null,
          showdownHoleCards: showdownHoleCards(hand),
          legalActions:
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
              ({ requestId, requesterId, targetPlayerId, amount, status }) => ({
                requestId,
                requesterId,
                targetPlayerId,
                amount,
                status,
              }),
            ),
        }
      : null,
    statistics: {
      players: statistics,
      titles: input.titles ?? [],
    },
  });
}
