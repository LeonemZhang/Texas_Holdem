import { ConnectionGuard } from '../connection/ConnectionGuard';
import { ChipExchangePanel } from '../room/ChipExchangePanel';
import { CreateRoomForm } from '../room/CreateRoomForm';
import { HandReadyOverlay } from '../room/HandReadyOverlay';
import { HostControls } from '../room/HostControls';
import { LobbyWaitingRoom } from '../room/LobbyWaitingRoom';
import { StatisticsPanel } from '../statistics/StatisticsPanel';
import { ActionCountdown } from '../table/ActionCountdown';
import { BettingControls } from '../table/BettingControls';
import { CardsAndPots } from '../table/CardsAndPots';
import { PokerTableLayout } from '../table/PokerTableLayout';
import { TableSeats } from '../table/TableSeats';

const noop = () => undefined;
const players = [
  {
    playerId: 'alice',
    nickname: 'Alice',
    seatIndex: 0,
    chips: 1_480,
    streetCommitted: 120,
    status: 'active' as const,
    isCurrentActor: true,
    isSmallBlind: true,
  },
  {
    playerId: 'bob',
    nickname: 'Bob',
    seatIndex: 1,
    chips: 720,
    streetCommitted: 120,
    status: 'active' as const,
    isBigBlind: true,
  },
  {
    playerId: 'carol',
    nickname: 'Carol',
    seatIndex: 2,
    chips: 800,
    streetCommitted: 340,
    status: 'all-in' as const,
    isDealer: true,
  },
];

const fullTablePlayers = Array.from({ length: 10 }, (_, index) => ({
  playerId: `player-${index}`,
  nickname: index === 7 ? '一位昵称特别长的玩家' : `玩家 ${index + 1}`,
  seatIndex: index,
  chips: 2_000 - index * 75,
  streetCommitted: index * 10,
  status:
    index === 4
      ? ('disconnected' as const)
      : index === 6
        ? ('folded' as const)
        : ('active' as const),
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
  participatedHands: 12,
  wonHands: Math.max(0, 5 - index),
  largestSingleHandProfit: 420,
  largestWonPot: 600,
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

function UtilityButtons() {
  return (
    <div className="poker-table-page__utility-actions">
      <button className="button button--secondary" type="button">
        筹码交换
      </button>
      <button className="button button--secondary" type="button">
        房主管理
      </button>
      <button className="button button--secondary" type="button">
        查看统计
      </button>
    </div>
  );
}

function TablePreview({ page }: { readonly page: string }) {
  const handReady = page === 'ready' || page === 'settlement';
  const tenPlayers = page === 'table-ten' || page === 'table-ten-own-action';
  const tablePlayers = tenPlayers
    ? fullTablePlayers.map((player, index) => ({
        ...player,
        isCurrentActor:
          page === 'table-ten-own-action' ? index === 0 : index === 3,
      }))
    : players;
  const actorName =
    page === 'table-ten-own-action'
      ? '玩家 1'
      : tenPlayers
        ? '玩家 4'
        : 'Alice';
  const utilityPanel =
    page === 'table-chip' ? (
      <ChipExchangePanel
        presentation="drawer"
        open
        phase="hand-ready"
        currentPlayerId="alice"
        players={players}
        records={[
          {
            requestId: 'r1',
            requesterId: 'bob',
            targetPlayerId: 'alice',
            amount: 200,
            status: 'pending',
          },
        ]}
        onAction={noop}
      />
    ) : page === 'table-host' ? (
      <HostControls
        presentation="drawer"
        open
        isHost
        hostPlayerId="alice"
        phase="hand-ready"
        players={players}
        onCommand={noop}
      />
    ) : page === 'table-statistics' ? (
      <StatisticsPanel
        open
        players={statistics}
        titles={titles}
        onClose={noop}
      />
    ) : null;

  return (
    <ConnectionGuard
      state={{ status: 'connected' }}
      onRetry={noop}
      onExitRoom={noop}
      clearReconnectSession={noop}
    >
      <PokerTableLayout
        roomName="朋友局"
        handLabel={
          handReady
            ? '第 8 手 · 结算与准备'
            : `第 8 手 · 翻牌 · 当前行动：${actorName}`
        }
        status={<UtilityButtons />}
        seats={
          <TableSeats
            players={tablePlayers}
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
              deadlineMs={Date.now() + 30_000}
              ownChoice="pending"
              pendingRequests={[
                {
                  requestId: 'r1',
                  requesterId: 'bob',
                  requesterName: 'Bob',
                  targetPlayerId: null,
                  amount: 200,
                },
              ]}
              complete={false}
              ownChips={2_000}
              onChoose={noop}
              onShowHoleCards={noop}
              settlement={
                page === 'settlement'
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
        controls={
          handReady ? null : (
            <BettingControls
              legalActions={{
                canFold: true,
                canCheck: false,
                callAmount: 40,
                minimumRaiseTo: 120,
                maximumRaiseTo: 720,
                canAllIn: true,
              }}
              roundContribution={80}
              handContribution={220}
              currentRoundBet={120}
              onAction={noop}
            />
          )
        }
      />
    </ConnectionGuard>
  );
}

export function UiSmokePreview({ page }: { readonly page: string }) {
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

  if (
    [
      'table',
      'table-ten',
      'table-ten-own-action',
      'ready',
      'settlement',
      'table-chip',
      'table-host',
      'table-statistics',
    ].includes(page)
  ) {
    return <TablePreview page={page} />;
  }

  if (page === 'statistics') {
    return (
      <StatisticsPanel
        open
        players={statistics}
        titles={titles}
        onClose={noop}
      />
    );
  }

  return (
    <div className="ui-smoke-stack">
      <CreateRoomForm onCreate={noop} />
      <ChipExchangePanel
        phase="hand-ready"
        currentPlayerId="alice"
        players={players}
        records={[]}
        onAction={noop}
      />
      <HostControls
        isHost
        hostPlayerId="alice"
        phase="hand-ready"
        players={players}
        onCommand={noop}
      />
    </div>
  );
}
