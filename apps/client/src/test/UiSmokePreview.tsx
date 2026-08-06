import { PageShell } from '@texas-holdem/ui';
import { useState } from 'react';

import { PROTOCOL_VERSION } from '@texas-holdem/protocol';

import { ConnectionGuard } from '../connection/ConnectionGuard';
import { ConnectionHome } from '../home/ConnectionHome';
import { NetworkDiagnostics } from '../home/NetworkDiagnostics';
import {
  RoomDiscoveryList,
  type RoomDiscoveryListItem,
} from '../home/RoomDiscoveryList';
import { ChipExchangePanel } from '../room/ChipExchangePanel';
import { DesktopRoomSetup } from '../room/DesktopRoomSetup';
import { HandReadyOverlay } from '../room/HandReadyOverlay';
import { HostControls } from '../room/HostControls';
import { LobbyWaitingRoom } from '../room/LobbyWaitingRoom';
import { RoomRecordManager } from '../room/RoomRecordManager';
import {
  TableUtilityToolbar,
  type TableUtilityPanel,
} from '../room/TableUtilityToolbar';
import { StatisticsPanel } from '../statistics/StatisticsPanel';
import { ActionCountdown } from '../table/ActionCountdown';
import { BettingControls } from '../table/BettingControls';
import { CardsAndPots } from '../table/CardsAndPots';
import { PokerTableLayout } from '../table/PokerTableLayout';
import { PotChipFlights } from '../table/PotChipFlights';
import { TableSeats } from '../table/TableSeats';
import type { RuntimeAdapter } from '../runtime';

const noop = () => undefined;
const previewHostService = {
  port: 32_100,
  advertisedAddress: '10.126.126.1',
  joinUrl: 'http://10.126.126.1:32100/?room=preview',
  dataDirectory: 'preview-rooms',
  networkName: '虚拟局域网',
};
const previewRuntime: RuntimeAdapter = {
  getRuntimeInfo: async () => ({
    kind: 'desktop',
    appVersion: 'development-preview',
    platform: 'win32',
  }),
  openRoomRecordManager: async () => undefined,
  listNetworkInterfaces: async () => [
    {
      name: '虚拟局域网',
      address: '10.126.126.1',
      netmask: '255.255.255.0',
      mac: '00:11:22:33:44:55',
    },
  ],
  scanLanRooms: async () => [],
  startHostService: async () => previewHostService,
  getActiveHostService: async () => previewHostService,
  stopHostService: async () => undefined,
  listRoomRecords: async () => [
    {
      roomId: 'preview-room',
      roomName: '周末牌局',
      hostNickname: 'Alice',
      status: 'recoverable',
      createdAt: '2026-08-05T12:00:00.000Z',
      lastActiveAt: '2026-08-05T12:34:56.000Z',
      completedHands: 8,
      playerCount: 3,
      network: { name: '虚拟局域网', address: '10.126.126.1' },
    },
  ],
  recoverRoomRecord: async () => ({
    protocolVersion: PROTOCOL_VERSION,
    roomId: 'preview-room',
    playerId: 'alice',
    token: 'preview-reconnect-token',
    joinUrl: previewHostService.joinUrl,
    socketPath: '/socket.io',
  }),
  closeRunningRoomRecord: async () => undefined,
  archiveRoomRecord: async () => undefined,
  restoreRoomRecord: async () => undefined,
  deleteRoomRecord: async () => undefined,
  onHostServiceExited: () => () => undefined,
  setWindowRoomContext: async () => undefined,
  onPlayerExitRequested: () => () => undefined,
  onHostCloseRequested: () => () => undefined,
};
const previewRooms: readonly RoomDiscoveryListItem[] = [
  {
    room: {
      magic: 'TEXAS_HOLDEM_LAN_V1',
      protocolVersion: PROTOCOL_VERSION,
      requestId: 'preview-scan',
      type: 'room',
      roomId: 'preview-room',
      roomName: '周末牌局',
      hostNickname: 'Alice',
      hostAddress: '10.126.126.1',
      httpPort: 32_100,
      playerCount: 3,
      maxPlayers: 10,
      smallBlind: 1,
      bigBlind: 2,
      phase: 'lobby',
    },
    compatibility: 'compatible',
    latencyMs: 12,
    expired: false,
    reconnectable: false,
  },
];
const players = [
  {
    playerId: 'alice',
    nickname: 'Alice',
    seatIndex: 0,
    chips: 1_480,
    streetCommitted: 120,
    totalCommitted: 320,
    actionOrder: 1,
    status: 'active' as const,
    lastAction: 'raiseTo' as const,
    isCurrentActor: true,
    isSmallBlind: true,
  },
  {
    playerId: 'bob',
    nickname: 'Bob',
    seatIndex: 1,
    chips: 720,
    streetCommitted: 120,
    totalCommitted: 320,
    actionOrder: 2,
    status: 'active' as const,
    lastAction: 'call' as const,
    isBigBlind: true,
  },
  {
    playerId: 'carol',
    nickname: 'Carol',
    seatIndex: 2,
    chips: 800,
    streetCommitted: 340,
    totalCommitted: 340,
    actionOrder: 3,
    status: 'all-in' as const,
    lastAction: 'allIn' as const,
    isDealer: true,
  },
];

const fullTablePlayers = Array.from({ length: 10 }, (_, index) => ({
  playerId: `player-${index}`,
  nickname: index === 7 ? '一位昵称特别长的玩家' : `玩家 ${index + 1}`,
  seatIndex: index,
  chips: 2_000 - index * 75,
  streetCommitted: index * 10,
  totalCommitted: index * 25,
  actionOrder: index + 1,
  status:
    index === 4
      ? ('disconnected' as const)
      : index === 6
        ? ('folded' as const)
        : ('active' as const),
  lastAction:
    index % 3 === 0
      ? ('check' as const)
      : index % 3 === 1
        ? ('call' as const)
        : ('raiseTo' as const),
  isCurrentActor: index === 3,
  isDealer: index === 0,
  isSmallBlind: index === 1,
  isBigBlind: index === 2,
}));

const statistics = fullTablePlayers.map((player, index) => ({
  playerId: player.playerId,
  nickname: player.nickname,
  initialChips: 1_500,
  currentChips: player.chips,
  netWinLoss: player.chips - 1_500,
  participatedHands: 12,
  wonHands: Math.max(0, 5 - index),
  largestSingleHandProfit: 420,
  largestSingleHandLoss: 360,
  showdownCount: 5,
  showdownWinRate: 0.6,
  actions: { fold: 3, check: 2, call: 6, raiseTo: 4, allIn: index + 1 },
}));

const titles = [
  { title: 'all-in-king', playerIds: ['player-0', 'player-2'], value: 3 },
  { title: 'unlucky-player', playerIds: ['player-1'], value: 2 },
  { title: 'pot-harvester', playerIds: ['player-0'], value: 1200 },
  { title: 'double-up-master', playerIds: ['player-0'], value: 420 },
  { title: 'bluff-king', playerIds: ['player-2'], value: 2 },
  { title: 'river-killer', playerIds: [], value: null },
  { title: 'tight-player', playerIds: ['player-1'], value: 0.7 },
];

const handPeaks = {
  global: {
    handType: 'three-of-a-kind',
    playerIds: ['player-0'],
    bestFiveCards: ['Qd', '2s', 'Kh', '2h', '2c'],
  },
  players: [
    {
      playerId: 'player-0',
      handType: 'one-pair',
      bestFiveCards: ['Kc', 'Tc', '9h', '9d', 'Qh'],
    },
    {
      playerId: 'player-1',
      handType: 'one-pair',
      bestFiveCards: ['Ac', 'Ad', 'Ks', 'Qh', 'Jc'],
    },
  ],
  hasLegacyCoverageGap: false,
};

export const uiSmokePreviewPages = [
  'overview',
  'home-browser',
  'home-desktop',
  'room-discovery',
  'network-diagnostics',
  'desktop-setup',
  'room-records',
  'lobby',
  'lobby-full',
  'table',
  'table-flights',
  'table-ten',
  'table-ten-own-action',
  'ready',
  'ready-waiting',
  'settlement',
  'settlement-waiting',
  'table-chip',
  'table-host',
  'table-statistics',
  'statistics',
] as const;

type UiSmokePreviewPage = (typeof uiSmokePreviewPages)[number];
type TablePreviewPage = Extract<
  UiSmokePreviewPage,
  | 'table'
  | 'table-flights'
  | 'table-ten'
  | 'table-ten-own-action'
  | 'ready'
  | 'ready-waiting'
  | 'settlement'
  | 'settlement-waiting'
  | 'table-chip'
  | 'table-host'
  | 'table-statistics'
>;

function previewPanel(page: TablePreviewPage): TableUtilityPanel | null {
  if (page === 'table-chip') return 'chip-exchange';
  if (page === 'table-host') return 'host';
  if (page === 'table-statistics') return 'statistics';
  return null;
}

function TablePreview({ page }: { readonly page: TablePreviewPage }) {
  const [activeUtilityPanel, setActiveUtilityPanel] =
    useState<TableUtilityPanel | null>(() => previewPanel(page));
  const waitingReady =
    page === 'ready-waiting' || page === 'settlement-waiting';
  const handReady =
    page === 'ready' ||
    page === 'ready-waiting' ||
    page === 'settlement' ||
    page === 'settlement-waiting';
  const tenPlayers = page === 'table-ten' || page === 'table-ten-own-action';
  const tablePlayers = tenPlayers
    ? fullTablePlayers.map((player, index) => ({
        ...player,
        isCurrentActor:
          page === 'table-ten-own-action' ? index === 0 : index === 3,
      }))
    : players;
  const showSettlement = page === 'settlement' || page === 'settlement-waiting';
  const renderedTablePlayers = tablePlayers.map((player, index) => ({
    ...player,
    ...(showSettlement
      ? {
          settlement: {
            netChange: index === 0 ? 780 : -Math.max(20, index * 20),
            ...(index < 3 ? { handType: index === 0 ? '一对' : '两对' } : {}),
          },
        }
      : {}),
  }));
  const actorName =
    page === 'table-ten-own-action'
      ? '玩家 1'
      : tenPlayers
        ? '玩家 4'
        : 'Alice';
  const isHost = page === 'table-host';
  const utilityPanel =
    activeUtilityPanel === 'chip-exchange' ? (
      <ChipExchangePanel
        presentation="drawer"
        open
        onOpenChange={(open) => {
          if (!open) setActiveUtilityPanel(null);
        }}
        phase="hand-ready"
        currentPlayerId="alice"
        players={players}
        records={[
          {
            kind: 'request',
            requestId: 'r1',
            requesterId: 'bob',
            targetPlayerId: 'alice',
            amount: 200,
            status: 'pending',
            rejectedByPlayerIds: [],
            completedByPlayerId: null,
            createdSequence: 1,
            updatedSequence: 1,
            createdAtMs: new Date(2026, 7, 5, 12, 34, 56).getTime(),
            updatedAtMs: new Date(2026, 7, 5, 12, 34, 56).getTime(),
          },
        ]}
        onAction={noop}
      />
    ) : activeUtilityPanel === 'host' ? (
      <HostControls
        presentation="drawer"
        open
        onOpenChange={(open) => {
          if (!open) setActiveUtilityPanel(null);
        }}
        isHost
        hostPlayerId="alice"
        phase="hand-ready"
        players={players}
        onCommand={noop}
      />
    ) : activeUtilityPanel === 'statistics' ? (
      <StatisticsPanel
        open
        players={statistics}
        titles={titles}
        handPeaks={handPeaks}
        onCollapse={() => setActiveUtilityPanel(null)}
      />
    ) : null;

  return (
    <ConnectionGuard state={{ status: 'connected' }} onRetry={noop}>
      <PokerTableLayout
        roomName="朋友局"
        handLabel={
          handReady
            ? '第 8 局 · 结算与准备'
            : `第 8 局 · 翻牌 · 当前行动：${actorName}`
        }
        status={
          <TableUtilityToolbar
            activePanel={activeUtilityPanel}
            isHost={isHost}
            onOpenPanel={(panel) => setActiveUtilityPanel(panel)}
            onExitRoom={isHost ? undefined : noop}
          />
        }
        seats={
          <TableSeats
            actionRoundKey={handReady ? 'preview:settled' : 'preview:flop'}
            players={renderedTablePlayers}
            ownPlayerId={tablePlayers[0]!.playerId}
          />
        }
        communityCards={
          handReady ? null : (
            <CardsAndPots
              communityCards={['2c', 'Td', 'Jh']}
              totalPot={580}
              currentStreet="flop"
              streetPots={[
                { street: 'preflop', amount: 420 },
                { street: 'flop', amount: 160 },
              ]}
              ownHoleCards={['Ah', 'Ks']}
            />
          )
        }
        actionTimer={
          handReady ? null : (
            <ActionCountdown
              deadlineMs={Date.now() + 18_000}
              actorName={actorName}
            />
          )
        }
        tableOverlay={
          handReady ? (
            <HandReadyOverlay
              deadlineMs={waitingReady ? Date.now() : Date.now() + 30_000}
              ownChoice={waitingReady ? 'sitting-out' : 'pending'}
              pendingRequests={
                waitingReady
                  ? []
                  : [
                      {
                        requestId: 'r1',
                        requesterId: 'bob',
                        requesterName: 'Bob',
                        targetPlayerId: 'alice',
                        amount: 200,
                      },
                    ]
              }
              complete={false}
              ownChips={2_000}
              onChoose={noop}
              onShowHoleCards={noop}
              settlement={
                page === 'settlement' || page === 'settlement-waiting'
                  ? {
                      handId: 'hand-8',
                      reason: 'showdown',
                      communityCards: ['2c', 'Td', 'Jh', 'Qs', 'Ac'],
                      totalPot: 1_380,
                      streetPots: [
                        { street: 'preflop', amount: 420 },
                        { street: 'flop', amount: 360 },
                        { street: 'turn', amount: 300 },
                        { street: 'river', amount: 300 },
                      ],
                      players: fullTablePlayers.map((player, index) => ({
                        playerId: player.playerId,
                        nickname: player.nickname,
                        chips: player.chips,
                        netChange:
                          index === 0 ? 780 : -Math.max(20, index * 20),
                        ...(index < 3
                          ? {
                              holeCards:
                                index === 0 ? ['Ah', 'Ks'] : ['Qc', 'Qd'],
                              bestFiveCards: ['Ac', 'Ah', 'Ks', 'Qs', 'Jh'],
                              handType: index === 0 ? '一对' : '两对',
                            }
                          : {}),
                      })),
                    }
                  : null
              }
            />
          ) : null
        }
        utilityPanel={utilityPanel}
        chipFlights={
          page === 'table-flights' ? (
            <PotChipFlights
              flights={[{ id: 'preview-flight', playerId: 'bob', amount: 40 }]}
              onFlightEnd={noop}
            />
          ) : null
        }
        controls={
          handReady ? null : (
            <BettingControls
              legalActions={{
                canFold: true,
                canCheck: false,
                callAmount: 2_660,
                minimumRaiseTo: 120,
                maximumRaiseTo: 720,
                canAllIn: true,
              }}
              onAction={noop}
            />
          )
        }
      />
    </ConnectionGuard>
  );
}

function isTablePreviewPage(page: string): page is TablePreviewPage {
  return [
    'table',
    'table-flights',
    'table-ten',
    'table-ten-own-action',
    'ready',
    'ready-waiting',
    'settlement',
    'settlement-waiting',
    'table-chip',
    'table-host',
    'table-statistics',
  ].includes(page);
}

export function UiSmokePreview({ page }: { readonly page: string }) {
  if (
    page === 'overview' ||
    page === 'home-browser' ||
    page === 'home-desktop'
  ) {
    const desktop = page !== 'home-browser';
    return (
      <PageShell title="Texas Hold'em" subtitle="私人局域网德州牌桌">
        <ConnectionHome
          runtimeKind={desktop ? 'desktop' : 'browser'}
          initialAddress="10.126.126.1:32100"
          onCreateRoom={noop}
          onManageRecords={noop}
          onRefreshRooms={noop}
          {...(desktop ? { onOpenDiagnostics: noop } : {})}
          joinReady
          runningRoomRecord={
            desktop
              ? {
                  roomId: 'preview-room',
                  roomName: '周末牌局',
                  hostNickname: 'Alice',
                  status: 'running',
                  createdAt: '2026-08-05T12:00:00.000Z',
                  lastActiveAt: '2026-08-05T12:34:56.000Z',
                  completedHands: 8,
                  playerCount: 3,
                }
              : null
          }
          onRecoverRunningRoom={noop}
          onProbeAddress={async () => true}
          onResetProbe={noop}
          onJoin={noop}
        />
      </PageShell>
    );
  }

  if (page === 'room-discovery') {
    return (
      <PageShell title="Texas Hold'em" subtitle="私人局域网德州牌桌">
        <section className="home-data-page" aria-label="附近牌桌">
          <div className="home-data-page__toolbar">
            <button className="button button--secondary" type="button">
              返回大厅
            </button>
            <button className="button button--secondary" type="button">
              刷新
            </button>
          </div>
          <RoomDiscoveryList
            rooms={previewRooms}
            refreshing={false}
            onRefresh={noop}
            onJoin={noop}
          />
        </section>
      </PageShell>
    );
  }

  if (page === 'network-diagnostics') {
    return (
      <PageShell title="Texas Hold'em" subtitle="私人局域网德州牌桌">
        <section className="home-data-page" aria-label="网络诊断">
          <div className="home-data-page__toolbar">
            <button className="button button--secondary" type="button">
              返回大厅
            </button>
          </div>
          <NetworkDiagnostics
            runtime={previewRuntime}
            hostService={previewHostService}
          />
        </section>
      </PageShell>
    );
  }

  if (page === 'desktop-setup') {
    return (
      <PageShell title="Texas Hold'em" subtitle="私人局域网德州牌桌">
        <DesktopRoomSetup
          runtime={previewRuntime}
          existingService={previewHostService}
          onClose={noop}
          onHosted={async (service) => service}
          onRecovered={noop}
        />
      </PageShell>
    );
  }

  if (page === 'room-records') {
    return (
      <PageShell title="Texas Hold'em" subtitle="私人局域网德州牌桌">
        <RoomRecordManager
          runtime={previewRuntime}
          onCreateRoom={noop}
          onClose={noop}
          onRecovered={noop}
        />
      </PageShell>
    );
  }

  if (page === 'lobby' || page === 'lobby-full') {
    const lobbyPlayers = page === 'lobby-full' ? fullTablePlayers : players;
    return (
      <div className="game-room-shell">
        <LobbyWaitingRoom
          roomName="朋友局"
          currentPlayerId={lobbyPlayers[0]!.playerId}
          players={lobbyPlayers.map((player, index) => ({
            ...player,
            isHost: index === 0,
            ready: index !== lobbyPlayers.length - 1,
            connected: player.status !== 'disconnected',
          }))}
          joinUrl="http://10.126.126.1:32100/?room=preview"
          onSetReady={noop}
          onStartFirstHand={noop}
          onRemovePlayer={noop}
          onCloseRoom={noop}
        />
      </div>
    );
  }

  if (isTablePreviewPage(page)) {
    return <TablePreview page={page} />;
  }

  if (page === 'statistics') {
    return (
      <StatisticsPanel
        open
        players={statistics}
        titles={titles}
        handPeaks={handPeaks}
        onCollapse={noop}
      />
    );
  }

  return <UiSmokePreview page="overview" />;
}
