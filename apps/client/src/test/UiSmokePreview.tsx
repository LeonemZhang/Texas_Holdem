import { BettingControls } from '../table/BettingControls';
import { ActionCountdown } from '../table/ActionCountdown';
import { CardsAndPots } from '../table/CardsAndPots';
import { PokerTableLayout } from '../table/PokerTableLayout';
import { TableSeats } from '../table/TableSeats';
import { ConnectionGuard } from '../connection/ConnectionGuard';
import { ChipExchangePanel } from '../room/ChipExchangePanel';
import { CreateRoomForm } from '../room/CreateRoomForm';
import { HandReadyOverlay } from '../room/HandReadyOverlay';
import { HostControls } from '../room/HostControls';
import { LobbyWaitingRoom } from '../room/LobbyWaitingRoom';
import { StatisticsPanel } from '../statistics/StatisticsPanel';

const noop = () => undefined;
const players = [
  {
    playerId: 'alice',
    nickname: 'Alice',
    seatIndex: 0,
    chips: 1_480,
    status: 'active' as const,
    isCurrentActor: true,
  },
  {
    playerId: 'bob',
    nickname: 'Bob',
    seatIndex: 1,
    chips: 720,
    status: 'active' as const,
  },
  {
    playerId: 'carol',
    nickname: 'Carol',
    seatIndex: 2,
    chips: 800,
    status: 'all-in' as const,
    isDealer: true,
  },
];

export function UiSmokePreview({ page }: { readonly page: string }) {
  if (page === 'table' || page === 'ready') {
    const handReady = page === 'ready';
    return (
      <ConnectionGuard
        state={{ status: 'connected' }}
        onRetry={noop}
        onExitRoom={noop}
        clearReconnectSession={noop}
      >
        <PokerTableLayout
          roomName="朋友局"
          handLabel="第 8 手 · 翻牌"
          status={
            <div className="poker-table-page__utility-actions">
              <ChipExchangePanel
                presentation="drawer"
                phase="hand-ready"
                currentPlayerId="alice"
                players={players}
                records={[]}
                onAction={noop}
              />
              <HostControls
                presentation="drawer"
                isHost
                hostPlayerId="alice"
                phase="hand-ready"
                players={players}
                onCommand={noop}
              />
              <button className="button button--secondary" type="button">
                查看统计
              </button>
            </div>
          }
          seats={<TableSeats players={players} ownPlayerId="alice" />}
          communityCards={
            <CardsAndPots
              ownHoleCards={['Ah', 'Ks']}
              communityCards={['2c', 'Td', 'Jh']}
              pots={[
                { amount: 420, eligiblePlayerIds: ['alice', 'bob', 'carol'] },
                { amount: 160, eligiblePlayerIds: ['alice', 'bob'] },
              ]}
            />
          }
          pots={null}
          actionTimer={
            handReady ? null : (
              <ActionCountdown
                deadlineMs={Date.now() + 18_000}
                actorName="Alice"
              />
            )
          }
          tableOverlay={
            handReady ? (
              <HandReadyOverlay
                deadlineMs={Date.now() + 30_000}
                ownChoice="pending"
                pendingRequests={[
                  { requestId: 'r1', requesterName: 'Bob', amount: 200 },
                ]}
                complete={false}
                onChoose={noop}
              />
            ) : null
          }
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

  if (page === 'statistics') {
    const statistics = players.map((player, index) => ({
      playerId: player.playerId,
      nickname: player.nickname,
      initialChips: 1_000,
      currentChips: player.chips,
      participatedHands: 12,
      wonHands: 4 - index,
      largestSingleHandProfit: 420,
      largestWonPot: 600,
      showdownCount: 5,
      showdownWinRate: 0.6,
      actions: { fold: 3, check: 2, call: 6, raiseTo: 4, allIn: index + 1 },
    }));
    return (
      <StatisticsPanel
        open
        players={statistics}
        titles={[
          { title: 'all-in-king', playerIds: ['alice', 'carol'], value: 3 },
          { title: 'unlucky-player', playerIds: ['bob'], value: 2 },
          { title: 'pot-harvester', playerIds: ['alice'], value: 1200 },
          { title: 'double-up-master', playerIds: ['alice'], value: 420 },
          { title: 'bluff-king', playerIds: ['carol'], value: 2 },
          { title: 'river-killer', playerIds: [], value: null },
          { title: 'tight-player', playerIds: ['bob'], value: 0.7 },
        ]}
        onClose={noop}
      />
    );
  }

  return (
    <div className="ui-smoke-stack">
      <CreateRoomForm onCreate={noop} />
      <LobbyWaitingRoom
        roomName="朋友局"
        currentPlayerId="alice"
        players={players.map((player) => ({
          ...player,
          isHost: player.playerId === 'alice',
          ready: player.playerId !== 'carol',
          connected: true,
        }))}
        onSetReady={noop}
        onStartFirstHand={noop}
      />
      <ChipExchangePanel
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
