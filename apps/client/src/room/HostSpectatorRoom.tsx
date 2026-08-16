import { useEffect, useState } from 'react';

import type { HostManagementSnapshot } from '@texas-holdem/protocol';

import { ActionCountdown } from '../table/ActionCountdown.js';
import { CardsAndPots } from '../table/CardsAndPots.js';
import { PokerTableLayout } from '../table/PokerTableLayout.js';
import { TableSeats, type TableSeatPlayer } from '../table/TableSeats.js';
import { HandReadyOverlay } from './HandReadyOverlay.js';
import { HostControls, type HostControlIntent } from './HostControls.js';
import {
  TableUtilityToolbar,
  type TableUtilityPanel,
} from './TableUtilityToolbar.js';

export interface HostSpectatorRoomProps {
  readonly snapshot: HostManagementSnapshot;
  readonly onBack: () => void;
  readonly joinUrl?: string;
  readonly onCommand?: (intent: HostControlIntent) => void;
}

const streetLabels: Record<
  'preflop' | 'flop' | 'turn' | 'river' | 'settled',
  string
> = {
  preflop: '翻牌前',
  flop: '翻牌',
  turn: '转牌',
  river: '河牌',
  settled: '已结算',
};

const handTypeLabels: Record<string, string> = {
  'high-card': '高牌',
  'one-pair': '一对',
  'two-pair': '两对',
  'three-of-a-kind': '三条',
  straight: '顺子',
  flush: '同花',
  'full-house': '葫芦',
  'four-of-a-kind': '四条',
  'straight-flush': '同花顺',
};

function currentHandLabel(snapshot: HostManagementSnapshot): string {
  if (!snapshot.game) return '等待首局';
  const handNumber =
    snapshot.game.handNumber ?? snapshot.room.completedHands + 1;
  return `第 ${handNumber} 局 · ${streetLabels[snapshot.game.street]} · 盲注：${snapshot.room.currentSmallBlind}/${snapshot.room.currentBigBlind}`;
}

function settlementFor(
  snapshot: HostManagementSnapshot,
  playerId: string,
): TableSeatPlayer['settlement'] {
  const settlement = snapshot.game?.settlement;
  if (!settlement) return undefined;
  const result = [
    ...settlement.showdownResults,
    ...(settlement.revealedHandResults ?? []),
  ].find((candidate) => candidate.playerId === playerId);
  return {
    netChange: settlement.netChanges[playerId] ?? 0,
    ...(result
      ? { handType: handTypeLabels[result.handType] ?? result.handType }
      : {}),
  };
}

function spectatorSeats(
  snapshot: HostManagementSnapshot,
  players: readonly HostManagementSnapshot['room']['players'][number][],
): readonly TableSeatPlayer[] {
  const game = snapshot.game;
  return players.map((player) => {
    const settlement = settlementFor(snapshot, player.playerId);
    return {
      playerId: player.playerId,
      nickname: player.nickname,
      seatIndex: player.seatIndex,
      chips: player.chips,
      streetCommitted: player.streetCommitted,
      totalCommitted: player.totalCommitted,
      actionOrder: player.actionOrder,
      status: player.status,
      isCurrentActor: player.playerId === game?.currentActorId,
      isDealer: player.playerId === game?.buttonPlayerId,
      isSmallBlind: player.playerId === game?.smallBlindPlayerId,
      isBigBlind: player.playerId === game?.bigBlindPlayerId,
      lastAction: player.lastAction,
      ...(settlement ? { settlement } : {}),
    };
  });
}

export function HostSpectatorRoom({
  snapshot,
  onBack,
  joinUrl,
  onCommand,
}: HostSpectatorRoomProps) {
  const [activeUtilityPanel, setActiveUtilityPanel] =
    useState<TableUtilityPanel | null>(null);
  const [settlementCollapsed, setSettlementCollapsed] = useState(false);
  const game = snapshot.game;
  const visiblePlayers = snapshot.room.players.filter(
    ({ status }) => !['left', 'removed'].includes(status),
  );
  const seats = spectatorSeats(snapshot, visiblePlayers);
  const actorName = game?.currentActorId
    ? (visiblePlayers.find((player) => player.playerId === game.currentActorId)
        ?.nickname ?? '玩家')
    : '玩家';
  const actionTimer =
    game?.actionDeadlineMs !== null &&
    game?.actionDeadlineMs !== undefined &&
    game.currentActorId ? (
      <ActionCountdown
        deadlineMs={game.actionDeadlineMs}
        actorName={actorName}
      />
    ) : null;
  const settlement = game?.settlement;
  const settlementHandId = game?.settlement ? game.handId : null;
  useEffect(() => {
    setSettlementCollapsed(false);
  }, [settlementHandId]);
  const settlementResults = [
    ...(settlement?.showdownResults ?? []),
    ...(settlement?.revealedHandResults ?? []),
  ];
  const settlementView = settlement
    ? {
        handId: game?.handId ?? 'settlement',
        handNumber: game?.handNumber ?? snapshot.room.completedHands + 1,
        reason: settlement.reason,
        communityCards: game?.communityCards ?? [],
        totalPot: game?.totalPot ?? 0,
        streetPots: game?.streetPots ?? [],
        players: visiblePlayers.map((player) => {
          const result = settlementResults.find(
            (candidate) => candidate.playerId === player.playerId,
          );
          const holeCards = game?.showdownHoleCards?.[player.playerId];
          const voluntaryRevealedHoleCards =
            settlement.voluntaryRevealedHoleCards[player.playerId];
          return {
            playerId: player.playerId,
            nickname: player.nickname,
            chips: player.chips,
            netChange: settlement.netChanges[player.playerId] ?? 0,
            ...(result
              ? {
                  handType: handTypeLabels[result.handType] ?? result.handType,
                  bestFiveCards: result.bestFiveCards,
                }
              : {}),
            ...(holeCards ? { holeCards } : {}),
            ...(voluntaryRevealedHoleCards
              ? { voluntaryRevealedHoleCards }
              : {}),
          };
        }),
      }
    : null;

  return (
    <div className="game-room-shell host-spectator">
      <PokerTableLayout
        roomName={snapshot.room.roomName}
        handLabel={currentHandLabel(snapshot)}
        mobileHandLabel={currentHandLabel(snapshot)}
        status={
          <TableUtilityToolbar
            activePanel={activeUtilityPanel}
            isHost={onCommand !== undefined}
            spectator
            onOpenPanel={(panel) => setActiveUtilityPanel(panel)}
            onBackToLobby={onBack}
          />
        }
        seats={
          <TableSeats
            players={seats}
            ownPlayerId=""
            actionRoundKey={game?.handId ?? null}
          />
        }
        communityCards={
          <CardsAndPots
            communityCards={game?.communityCards ?? []}
            totalPot={game?.totalPot ?? 0}
            streetPots={game?.streetPots ?? []}
            currentStreet={game?.street}
            ownHoleCards={null}
            hideHoleCards
          />
        }
        actionTimer={actionTimer}
        tableOverlay={
          settlementView ? (
            <HandReadyOverlay
              spectator
              ownChoice="pending"
              deadlineMs={0}
              pendingRequests={[]}
              complete={false}
              ownChips={0}
              onChoose={() => undefined}
              onSettlementCollapsedChange={setSettlementCollapsed}
              settlementCollapsed={settlementCollapsed}
              settlement={settlementView}
            />
          ) : null
        }
        utilityPanel={
          activeUtilityPanel === 'host' && onCommand ? (
            <HostControls
              presentation="drawer"
              open
              onOpenChange={(open) => {
                if (!open) setActiveUtilityPanel(null);
              }}
              isHost
              hostPlayerId={snapshot.hostId}
              phase={snapshot.room.phase}
              {...(joinUrl ? { joinUrl } : {})}
              settings={snapshot.room.settings}
              currentSmallBlind={snapshot.room.currentSmallBlind}
              players={visiblePlayers}
              onCommand={onCommand}
            />
          ) : null
        }
        controls={
          <section className="host-spectator__controls" aria-label="观战控制">
            <span>只读观战 · 仅显示公开信息</span>
          </section>
        }
      />
    </div>
  );
}
