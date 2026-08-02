import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

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
import { ActionCountdown } from '../table/ActionCountdown.js';
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
import { createRandomId } from '../random-id.js';
import {
  PokerSoundEffects,
  pokerSoundCues,
} from '../sound/poker-sound-effects.js';

const streetLabels = {
  preflop: '翻牌前',
  flop: '翻牌',
  turn: '转牌',
  river: '河牌',
  settled: '结算',
} as const;

export interface GameRoomProps {
  readonly session: RoomSessionResponse;
  readonly connectionFactory?: (
    session: RoomSessionResponse,
  ) => ConnectionAdapter;
  readonly onExited?: () => void;
  readonly onCommandPortChange?: (
    port: ((command: Record<string, unknown>) => Promise<boolean>) | null,
  ) => void;
}

function defaultConnection(session: RoomSessionResponse): ConnectionAdapter {
  const url = new URL(session.joinUrl);
  return new SocketIoConnectionAdapter(url.origin, session.socketPath);
}

export function GameRoom({
  session,
  connectionFactory = defaultConnection,
  onExited,
  onCommandPortChange,
}: GameRoomProps) {
  const connection = useMemo(
    () => connectionFactory(session),
    [connectionFactory, session],
  );
  const [snapshot, setSnapshot] = useState<PlayerSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statisticsOpen, setStatisticsOpen] = useState(false);
  const [hostShareOpen, setHostShareOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const latestSnapshot = useRef<PlayerSnapshot | null>(null);
  const soundEffects = useMemo(() => new PokerSoundEffects(), []);

  useEffect(() => {
    soundEffects.enableOnFirstInteraction();
    return () => soundEffects.dispose();
  }, [soundEffects]);

  useEffect(() => {
    const stopSnapshot = connection.onSnapshot((next) => {
      if (
        latestSnapshot.current &&
        next.sequence < latestSnapshot.current.sequence
      ) {
        return;
      }
      soundEffects.play(pokerSoundCues(latestSnapshot.current, next));
      latestSnapshot.current = next;
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
  }, [connection, session, soundEffects]);

  const send = useCallback(
    async (command: Record<string, unknown>): Promise<boolean> => {
      const submittedSnapshot = latestSnapshot.current;
      if (!submittedSnapshot || sending) return false;
      setSending(true);
      setError(null);
      try {
        const submit = (expectedVersion: number) =>
          connection.sendCommand({
            ...command,
            protocolVersion: PROTOCOL_VERSION,
            roomId: session.roomId,
            playerId: session.playerId,
            expectedVersion,
          });
        let response = await submit(submittedSnapshot.stateVersion);
        const refreshedSnapshot = latestSnapshot.current;
        if (
          response.status === 'conflict' &&
          refreshedSnapshot &&
          refreshedSnapshot.stateVersion > submittedSnapshot.stateVersion
        ) {
          response = await submit(refreshedSnapshot.stateVersion);
        }
        if (response.status !== 'accepted') {
          setError(
            response.status === 'conflict'
              ? '对局状态刚刚更新，已同步最新状态，请再次操作。'
              : response.error.message,
          );
          return false;
        }
        return true;
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : '命令发送失败');
        return false;
      } finally {
        setSending(false);
      }
    },
    [connection, sending, session],
  );

  useEffect(() => {
    return () => {
      latestSnapshot.current = null;
    };
  }, [connection]);

  useEffect(() => {
    onCommandPortChange?.(send);
    return () => onCommandPortChange?.(null);
  }, [onCommandPortChange, send]);

  const sendBetting = (intent: BettingActionIntent) => void send(intent);
  const sendHostControl = (intent: HostControlIntent) => {
    void send(intent);
  };
  const sendChipIntent = (intent: ChipExchangeIntent) => {
    switch (intent.type) {
      case 'request':
        void send({
          type: 'chips.request',
          requestId: createRandomId(),
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
          transferId: createRandomId(),
          receiverPlayerId: intent.receiverPlayerId,
          amount: intent.amount,
        });
        break;
      case 'approve':
        void send({
          type: 'chips.approve',
          requestId: intent.requestId,
          transferId: createRandomId(),
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
  const incomingChipRequest = snapshot.handReady?.pendingRequests.find(
    (request) =>
      request.requesterId !== session.playerId &&
      (request.targetPlayerId === null ||
        request.targetPlayerId === session.playerId),
  );
  const incomingChipRequestView = incomingChipRequest
    ? {
        requestId: incomingChipRequest.requestId,
        requesterId: incomingChipRequest.requesterId,
        requesterName:
          names.get(incomingChipRequest.requesterId) ?? '玩家',
        targetPlayerId: incomingChipRequest.targetPlayerId,
        amount: incomingChipRequest.amount,
      }
    : null;
  const statistics = snapshot.statistics.players.map((player) => ({
    ...player,
    nickname: names.get(player.playerId) ?? player.playerId,
    initialChips: snapshot.room.initialChips,
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
              handId: createRandomId(),
            })
          }
        />
        {own?.isHost ? (
          <HostControls
            isHost
            hostPlayerId={session.playerId}
            phase={snapshot.room.phase}
            players={snapshot.room.players
              .filter(({ status }) => status !== 'left')
              .map(({ playerId, nickname }) => ({ playerId, nickname }))}
            onCommand={sendHostControl}
          />
        ) : null}
        {own?.isHost ? (
          <section className="host-share" aria-labelledby="game-invite-title">
            <header className="host-share__header">
              <div>
                <p className="connection-home__kicker">邀请朋友加入</p>
                <h2 id="game-invite-title">房间邀请</h2>
              </div>
              <button
                className="button button--secondary"
                type="button"
                aria-expanded={hostShareOpen}
                aria-controls="host-share-content"
                onClick={() => setHostShareOpen((current) => !current)}
              >
                {hostShareOpen ? '收起邀请信息' : '展开邀请信息'}
              </button>
            </header>
            {hostShareOpen ? (
              <div id="host-share-content" className="host-share__content">
                <a href={session.joinUrl}>{session.joinUrl}</a>
                <QRCodeSVG
                  value={session.joinUrl}
                  size={144}
                  title="加入房间二维码"
                />
              </div>
            ) : null}
          </section>
        ) : null}
        <button
          className="button button--secondary"
          type="button"
          onClick={() => {
            void send({ type: 'room.exit' }).then((accepted) => {
              if (accepted) onExited?.();
            });
          }}
        >
          退出房间
        </button>
      </div>
    );
  }

  if (snapshot.room.phase === 'closed') {
    return (
      <div className="game-room-shell">
        <section className="room-closed" aria-labelledby="room-closed-title">
          <p className="connection-home__kicker">对局已结束</p>
          <h1 id="room-closed-title">房间已关闭</h1>
          <p>{snapshot.room.roomName} 已由房主关闭，牌局数据已保存。</p>
          <div>
            <button type="button" onClick={() => setStatisticsOpen(true)}>
              查看最终统计
            </button>
            <button type="button" onClick={onExited}>
              返回联机首页
            </button>
          </div>
        </section>
        <StatisticsPanel
          open={statisticsOpen}
          players={statistics}
          titles={snapshot.statistics.titles}
          onClose={() => setStatisticsOpen(false)}
        />
      </div>
    );
  }

  const game = snapshot.game;
  const actionActor = game?.currentActorId
    ? snapshot.room.players.find(
        ({ playerId }) => playerId === game.currentActorId,
      )
    : null;
  const currentRoundBet = Math.max(
    0,
    ...snapshot.room.players.map(({ streetCommitted }) => streetCommitted ?? 0),
  );
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
            ? `第 ${snapshot.room.completedHands + 1} 手 · ${streetLabels[game.street]}${actionActor ? ` · 当前行动：${actionActor.nickname}` : ''}`
            : '等待牌局开始'
        }
        status={
          <div className="poker-table-page__utility-actions">
            <ChipExchangePanel
              presentation="drawer"
              phase={snapshot.room.phase}
              currentPlayerId={session.playerId}
              players={snapshot.room.players}
              records={snapshot.handReady?.pendingRequests ?? []}
              onAction={sendChipIntent}
            />
            <HostControls
              presentation="drawer"
              isHost={own?.isHost ?? false}
              hostPlayerId={
                snapshot.room.players.find(({ isHost }) => isHost)?.playerId ??
                ''
              }
              phase={snapshot.room.phase}
              players={snapshot.room.players}
              onCommand={sendHostControl}
            />
            <button
              className="button button--secondary"
              type="button"
              onClick={() => setStatisticsOpen(true)}
            >
              查看统计
            </button>
          </div>
        }
        seats={
          <TableSeats
            ownPlayerId={session.playerId}
            players={snapshot.room.players.map((player) => ({
              ...player,
              isCurrentActor: game?.currentActorId === player.playerId,
              isDealer: game?.buttonPlayerId === player.playerId,
              isSmallBlind: game?.smallBlindPlayerId === player.playerId,
              isBigBlind: game?.bigBlindPlayerId === player.playerId,
            }))}
          />
        }
        communityCards={
          <CardsAndPots
            ownHoleCards={game?.ownHoleCards ?? null}
            communityCards={game?.communityCards ?? []}
            pots={game?.pots ?? []}
            showdownHands={Object.entries(game?.showdownHoleCards ?? {}).map(
              ([playerId, cards]) => ({
                playerId,
                nickname: names.get(playerId) ?? playerId,
                cards,
              }),
            )}
          />
        }
        pots={null}
        actionTimer={
          game?.actionDeadlineMs !== null &&
          game?.actionDeadlineMs !== undefined &&
          actionActor ? (
            <ActionCountdown
              deadlineMs={game.actionDeadlineMs}
              actorName={actionActor.nickname}
            />
          ) : null
        }
        tableOverlay={
          snapshot.handReady ? (
            <HandReadyOverlay
              deadlineMs={snapshot.handReady.deadlineMs}
              ownChoice={snapshot.handReady.ownChoice}
              pendingRequests={snapshot.handReady.pendingRequests.map(
                (request) => ({
                  requestId: request.requestId,
                  requesterId: request.requesterId,
                  requesterName:
                    names.get(request.requesterId) ?? request.requesterId,
                  targetPlayerId: request.targetPlayerId,
                  amount: request.amount,
                }),
              )}
              complete={false}
              onChoose={(choice) =>
                void send({ type: 'hand-ready.set-choice', choice })
              }
              requestToReview={incomingChipRequestView}
              onApproveRequest={(requestId) =>
                sendChipIntent({ type: 'approve', requestId })
              }
              onRejectRequest={(requestId) =>
                sendChipIntent({ type: 'reject', requestId })
              }
            />
          ) : null
        }
        controls={
          snapshot.handReady ? null : (
            <BettingControls
              legalActions={game?.legalActions ?? null}
              roundContribution={own?.streetCommitted ?? 0}
              handContribution={own?.totalCommitted ?? 0}
              currentRoundBet={currentRoundBet}
              disabled={sending || snapshot.room.phase !== 'playing'}
              onAction={sendBetting}
            />
          )
        }
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
