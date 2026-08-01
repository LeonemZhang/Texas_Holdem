import { useEffect, useMemo, useState } from 'react';

import {
  PROTOCOL_VERSION,
  type PlayerSnapshot,
  type RoomSessionResponse,
} from '@texas-holdem/protocol';

import type { ConnectionAdapter } from '../connection/connection.js';
import { SocketIoConnectionAdapter } from '../connection/socket-io-adapter.js';
import { StatisticsPanel } from '../statistics/StatisticsPanel.js';
import {
  BettingControls,
  type BettingActionIntent,
} from '../table/BettingControls.js';
import { CardsAndPots } from '../table/CardsAndPots.js';
import { PokerTableLayout } from '../table/PokerTableLayout.js';
import { TableSeats } from '../table/TableSeats.js';
import {
  ChipExchangePanel,
  type ChipExchangeIntent,
} from './ChipExchangePanel.js';
import { HandReadyOverlay } from './HandReadyOverlay.js';
import { HostControls, type HostControlIntent } from './HostControls.js';
import { LobbyWaitingRoom } from './LobbyWaitingRoom.js';

export interface GameRoomProps {
  readonly session: RoomSessionResponse;
  readonly connectionFactory?: (
    session: RoomSessionResponse,
  ) => ConnectionAdapter;
  readonly onExited?: () => void;
}

function defaultConnection(session: RoomSessionResponse): ConnectionAdapter {
  const url = new URL(session.joinUrl);
  return new SocketIoConnectionAdapter(url.origin, session.socketPath);
}

export function GameRoom({
  session,
  connectionFactory = defaultConnection,
  onExited,
}: GameRoomProps) {
  const connection = useMemo(
    () => connectionFactory(session),
    [connectionFactory, session],
  );
  const [snapshot, setSnapshot] = useState<PlayerSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statisticsOpen, setStatisticsOpen] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const stopSnapshot = connection.onSnapshot((next) => {
      setSnapshot(next);
      setError(null);
    });
    const stopLost = connection.onConnectionLost(() =>
      setError('连接已中断，正在等待重新连接'),
    );
    const stopEvent = connection.onDomainEvent(() => undefined);
    void connection
      .connect({
        protocolVersion: PROTOCOL_VERSION,
        roomId: session.roomId,
        playerId: session.playerId,
        token: session.token,
      })
      .catch((reason: unknown) =>
        setError(reason instanceof Error ? reason.message : '连接房间失败'),
      );
    return () => {
      stopSnapshot();
      stopLost();
      stopEvent();
      connection.disconnect();
    };
  }, [connection, session]);

  const send = async (command: Record<string, unknown>) => {
    if (!snapshot || sending) return;
    setSending(true);
    setError(null);
    try {
      const response = await connection.sendCommand({
        protocolVersion: PROTOCOL_VERSION,
        roomId: session.roomId,
        playerId: session.playerId,
        expectedVersion: snapshot.stateVersion,
        ...command,
      });
      if (response.status !== 'accepted') {
        setError(response.error.message);
      }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '命令发送失败');
    } finally {
      setSending(false);
    }
  };

  const sendBetting = (intent: BettingActionIntent) => void send(intent);
  const sendHostControl = (intent: HostControlIntent) => {
    if (intent.type === 'room.remove-player') {
      setError('当前版本不支持房主主动移除玩家');
      return;
    }
    void send(intent);
  };
  const sendChipIntent = (intent: ChipExchangeIntent) => {
    switch (intent.type) {
      case 'request':
        void send({
          type: 'chips.request',
          requestId: crypto.randomUUID(),
          audience: intent.targetPlayerId ? 'targeted' : 'table',
          ...(intent.targetPlayerId
            ? { targetPlayerId: intent.targetPlayerId }
            : {}),
          amount: intent.amount,
        });
        break;
      case 'give':
        void send({
          type: 'chips.give',
          transferId: crypto.randomUUID(),
          receiverPlayerId: intent.receiverPlayerId,
          amount: intent.amount,
        });
        break;
      case 'approve':
        void send({
          type: 'chips.approve',
          requestId: intent.requestId,
          transferId: crypto.randomUUID(),
        });
        break;
      case 'reject':
        void send({ type: 'chips.reject', requestId: intent.requestId });
        break;
      case 'revoke':
        void send({ type: 'chips.revoke', requestId: intent.requestId });
        break;
    }
  };

  if (!snapshot) {
    return (
      <section className="game-room-loading" aria-live="polite">
        <h2>正在连接牌桌</h2>
        <p>{error ?? '正在获取服务端状态…'}</p>
      </section>
    );
  }

  const own = snapshot.room.players.find(
    ({ playerId }) => playerId === session.playerId,
  );
  const names = new Map(
    snapshot.room.players.map(({ playerId, nickname }) => [playerId, nickname]),
  );
  const statistics = snapshot.statistics.players.map((player) => ({
    ...player,
    nickname: names.get(player.playerId) ?? player.playerId,
    initialChips: player.currentChips,
    largestSingleHandProfit: 0,
    largestWonPot: 0,
    showdownCount: 0,
    actions: { fold: 0, check: 0, call: 0, raiseTo: 0, allIn: 0 },
  }));

  if (snapshot.room.phase === 'lobby') {
    return (
      <div className="game-room-shell" aria-busy={sending}>
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <LobbyWaitingRoom
          roomName={snapshot.room.roomName}
          currentPlayerId={session.playerId}
          players={snapshot.room.players.map((player) => ({
            playerId: player.playerId,
            nickname: player.nickname,
            seatIndex: player.seatIndex,
            isHost: player.isHost,
            ready: player.lobbyReady,
            connected: player.status !== 'disconnected',
          }))}
          onSetReady={(ready) =>
            void send({ type: 'room.set-lobby-ready', ready })
          }
          onStartFirstHand={() =>
            void send({
              type: 'room.start-first-hand',
              handId: crypto.randomUUID(),
            })
          }
        />
        <button
          className="button button--secondary"
          type="button"
          onClick={() => {
            void send({ type: 'room.exit' }).then(onExited);
          }}
        >
          退出房间
        </button>
      </div>
    );
  }

  const game = snapshot.game;
  return (
    <div className="game-room-shell" aria-busy={sending}>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <PokerTableLayout
        roomName={snapshot.room.roomName}
        handLabel={
          game
            ? `第 ${snapshot.room.completedHands + 1} 手 · ${game.street}`
            : '牌局状态'
        }
        status={
          <button type="button" onClick={() => setStatisticsOpen(true)}>
            查看统计
          </button>
        }
        seats={
          <TableSeats
            ownPlayerId={session.playerId}
            players={snapshot.room.players.map((player) => ({
              ...player,
              isCurrentActor: game?.currentActorId === player.playerId,
              isDealer: game?.buttonPlayerId === player.playerId,
            }))}
          />
        }
        communityCards={
          <CardsAndPots
            ownHoleCards={game?.ownHoleCards ?? null}
            communityCards={game?.communityCards ?? []}
            pots={game?.pots ?? []}
          />
        }
        pots={null}
        controls={
          <BettingControls
            legalActions={game?.legalActions ?? null}
            disabled={sending || snapshot.room.phase !== 'playing'}
            onAction={sendBetting}
          />
        }
      />
      <ChipExchangePanel
        phase={snapshot.room.phase}
        currentPlayerId={session.playerId}
        players={snapshot.room.players}
        records={snapshot.handReady?.pendingRequests ?? []}
        onAction={sendChipIntent}
      />
      {snapshot.handReady ? (
        <HandReadyOverlay
          deadlineMs={snapshot.handReady.deadlineMs}
          ownChoice={snapshot.handReady.ownChoice}
          pendingRequests={snapshot.handReady.pendingRequests.map(
            (request) => ({
              requestId: request.requestId,
              requesterName:
                names.get(request.requesterId) ?? request.requesterId,
              amount: request.amount,
            }),
          )}
          complete={false}
          onChoose={(choice) =>
            void send({ type: 'hand-ready.set-choice', choice })
          }
        />
      ) : null}
      <HostControls
        isHost={own?.isHost ?? false}
        hostPlayerId={
          snapshot.room.players.find(({ isHost }) => isHost)?.playerId ?? ''
        }
        phase={snapshot.room.phase}
        players={snapshot.room.players}
        onCommand={sendHostControl}
      />
      <StatisticsPanel
        open={statisticsOpen}
        players={statistics}
        titles={snapshot.statistics.titles}
        onClose={() => setStatisticsOpen(false)}
      />
    </div>
  );
}
