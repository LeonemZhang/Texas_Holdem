import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PROTOCOL_VERSION,
  type PlayerSnapshot,
  type RoomSessionResponse,
} from '@texas-holdem/protocol';

import type { ConnectionAdapter } from '../connection/connection.js';
import { SocketIoConnectionAdapter } from '../connection/socket-io-adapter.js';
import { networkErrorMessage } from '../connection/error-message.js';
import { StatisticsPanel } from '../statistics/StatisticsPanel.js';
import {
  BettingControls,
  type BettingActionIntent,
} from '../table/BettingControls.js';
import { ActionCountdown } from '../table/ActionCountdown.js';
import { CardsAndPots } from '../table/CardsAndPots.js';
import { PokerTableLayout } from '../table/PokerTableLayout.js';
import { PotChipFlights, type PotChipFlight } from '../table/PotChipFlights.js';
import { TableSeats } from '../table/TableSeats.js';
import {
  ChipExchangePanel,
  type ChipExchangeIntent,
} from './ChipExchangePanel.js';
import { HandReadyOverlay } from './HandReadyOverlay.js';
import { HostControls, type HostControlIntent } from './HostControls.js';
import { LobbyWaitingRoom } from './LobbyWaitingRoom.js';
import {
  TableUtilityToolbar,
  type TableUtilityPanel,
} from './TableUtilityToolbar.js';
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

export function potContributionFlights(
  previous: PlayerSnapshot | null,
  next: PlayerSnapshot,
): readonly PotChipFlight[] {
  const previousGame = previous?.game;
  const nextGame = next.game;
  if (
    !previousGame ||
    !nextGame ||
    previousGame.handId !== nextGame.handId ||
    previous?.room.phase !== 'playing' ||
    next.room.phase !== 'playing' ||
    nextGame.totalPot <= previousGame.totalPot
  ) {
    return [];
  }
  const previousCommitted = new Map(
    previous.room.players.map((player) => [
      player.playerId,
      player.streetCommitted,
    ]),
  );
  return next.room.players.flatMap((player) => {
    const amount =
      player.streetCommitted - (previousCommitted.get(player.playerId) ?? 0);
    return amount > 0
      ? [
          {
            id: `${next.sequence}-${player.playerId}`,
            playerId: player.playerId,
            amount,
          },
        ]
      : [];
  });
}

export interface GameRoomProps {
  readonly session: RoomSessionResponse;
  readonly connectionFactory?: (
    session: RoomSessionResponse,
  ) => ConnectionAdapter;
  readonly onExited?: (reason: 'left' | 'removed' | 'closed') => void;
  readonly onHostRoomClosed?: () => Promise<void>;
  readonly onCommandPortChange?: (
    port: ((command: Record<string, unknown>) => Promise<boolean>) | null,
  ) => void;
}

type ActiveUtilityPanel = TableUtilityPanel | null;

function defaultConnection(session: RoomSessionResponse): ConnectionAdapter {
  const url = new URL(session.joinUrl);
  return new SocketIoConnectionAdapter(url.origin, session.socketPath);
}

export function GameRoom({
  session,
  connectionFactory = defaultConnection,
  onExited,
  onHostRoomClosed,
  onCommandPortChange,
}: GameRoomProps) {
  const connection = useMemo(
    () => connectionFactory(session),
    [connectionFactory, session],
  );
  const [snapshot, setSnapshot] = useState<PlayerSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statisticsOpen, setStatisticsOpen] = useState(false);
  const [statisticsCollapsed, setStatisticsCollapsed] = useState(false);
  const [activeUtilityPanel, setActiveUtilityPanel] =
    useState<ActiveUtilityPanel>(null);
  const [sending, setSending] = useState(false);
  const [potChipFlights, setPotChipFlights] = useState<
    readonly PotChipFlight[]
  >([]);
  const latestSnapshot = useRef<PlayerSnapshot | null>(null);
  const stoppedHostRoomId = useRef<string | null>(null);
  const removedExitNotified = useRef(false);
  const onExitedRef = useRef(onExited);
  const lastUtilityTrigger = useRef<HTMLButtonElement | null>(null);
  const soundEffects = useMemo(() => new PokerSoundEffects(), []);

  const openUtilityPanel = useCallback(
    (panel: Exclude<ActiveUtilityPanel, null>, trigger: HTMLButtonElement) => {
      lastUtilityTrigger.current = trigger;
      setActiveUtilityPanel(panel);
    },
    [],
  );
  const closeUtilityPanel = useCallback(() => {
    setActiveUtilityPanel(null);
    lastUtilityTrigger.current?.focus();
  }, []);

  useEffect(() => {
    onExitedRef.current = onExited;
  }, [onExited]);

  useEffect(() => {
    soundEffects.enableOnFirstInteraction();
    return () => soundEffects.dispose();
  }, [soundEffects]);

  const hasIncomingChipRequest =
    snapshot?.chipRequests.some(
      (request) =>
        request.status === 'pending' &&
        request.requesterId !== session.playerId &&
        request.targetPlayerId === session.playerId &&
        !request.rejectedByPlayerIds.includes(session.playerId),
    ) ?? false;

  useEffect(() => {
    if (hasIncomingChipRequest) setActiveUtilityPanel('chip-exchange');
  }, [hasIncomingChipRequest]);

  useEffect(() => {
    if (activeUtilityPanel === null) return undefined;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeUtilityPanel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeUtilityPanel, closeUtilityPanel]);

  useEffect(() => {
    const stopSnapshot = connection.onSnapshot((next) => {
      if (
        latestSnapshot.current &&
        next.sequence < latestSnapshot.current.sequence
      ) {
        return;
      }
      const flights = potContributionFlights(latestSnapshot.current, next);
      if (flights.length > 0) {
        setPotChipFlights((current) => [...current, ...flights]);
      }
      soundEffects.play(pokerSoundCues(latestSnapshot.current, next));
      latestSnapshot.current = next;
      setSnapshot(next);
      setError(null);
      if (
        !removedExitNotified.current &&
        next.room.players.some(
          ({ playerId, status }) =>
            playerId === session.playerId && status === 'removed',
        )
      ) {
        removedExitNotified.current = true;
        onExitedRef.current?.('removed');
      }
    });
    const stopLost = connection.onConnectionLost(() => {
      // A host closes its local service only after the final closed snapshot
      // has been delivered. That expected disconnect must not mask the normal
      // room-closed state as a network failure.
      if (latestSnapshot.current?.room.phase !== 'closed') {
        setError('网络异常，请重试');
      }
    });
    const stopEvent = connection.onDomainEvent(() => undefined);
    void connection
      .connect({
        protocolVersion: PROTOCOL_VERSION,
        roomId: session.roomId,
        playerId: session.playerId,
        token: session.token,
      })
      .catch((reason: unknown) =>
        setError(
          networkErrorMessage(reason instanceof Error ? reason.message : null),
        ),
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
      if (
        !submittedSnapshot ||
        sending ||
        submittedSnapshot.room.players.some(
          ({ playerId, status }) =>
            playerId === session.playerId && status === 'removed',
        )
      ) {
        return false;
      }
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
        setError(
          networkErrorMessage(reason instanceof Error ? reason.message : null),
        );
        return false;
      } finally {
        setSending(false);
      }
    },
    [connection, sending, session],
  );

  const dismissPotChipFlight = useCallback((id: string) => {
    setPotChipFlights((current) =>
      current.filter((flight) => flight.id !== id),
    );
  }, []);

  useEffect(() => {
    return () => {
      latestSnapshot.current = null;
    };
  }, [connection]);

  useEffect(() => {
    onCommandPortChange?.(send);
    return () => onCommandPortChange?.(null);
  }, [onCommandPortChange, send]);

  useEffect(() => {
    if (
      !snapshot ||
      snapshot.room.phase !== 'closed' ||
      !onHostRoomClosed ||
      stoppedHostRoomId.current === snapshot.roomId ||
      !snapshot.room.players.some(
        ({ playerId, isHost }) => playerId === session.playerId && isHost,
      )
    ) {
      return;
    }
    stoppedHostRoomId.current = snapshot.roomId;
    void onHostRoomClosed().catch(() => setError('停止房主服务失败，请重试。'));
  }, [onHostRoomClosed, session.playerId, snapshot]);

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
          targetPlayerId: intent.targetPlayerId,
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
  const chipRequests = snapshot.chipRequests;
  const incomingChipRequest = chipRequests.find(
    (request) =>
      request.requesterId !== session.playerId &&
      request.targetPlayerId === session.playerId &&
      !request.rejectedByPlayerIds.includes(session.playerId),
  );
  const incomingChipRequestView = incomingChipRequest
    ? {
        requestId: incomingChipRequest.requestId,
        requesterId: incomingChipRequest.requesterId,
        requesterName: names.get(incomingChipRequest.requesterId) ?? '玩家',
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
          players={snapshot.room.players
            .filter((player) => !['left', 'removed'].includes(player.status))
            .map((player) => ({
              playerId: player.playerId,
              nickname: player.nickname,
              seatIndex: player.seatIndex,
              isHost: player.isHost,
              ready: player.lobbyReady,
              connected: player.status !== 'disconnected',
            }))}
          {...(own?.isHost ? { joinUrl: session.joinUrl } : {})}
          onSetReady={(ready) =>
            void send({ type: 'room.set-lobby-ready', ready })
          }
          onStartFirstHand={() =>
            void send({
              type: 'room.start-first-hand',
              handId: createRandomId(),
            })
          }
          onRemovePlayer={(targetPlayerId) =>
            void send({ type: 'room.remove-player', targetPlayerId })
          }
          onCloseRoom={() => void send({ type: 'room.close' })}
          onReseatPlayer={(targetPlayerId, seatIndex) =>
            void send({
              type: 'room.reseat-player',
              targetPlayerId,
              seatIndex,
            })
          }
          onShuffleSeats={() => void send({ type: 'room.shuffle-seats' })}
        />
        {!own?.isHost ? (
          <button
            className="button button--secondary"
            type="button"
            onClick={() => {
              void send({ type: 'room.exit' }).then((accepted) => {
                if (accepted) onExited?.('left');
              });
            }}
          >
            退出房间
          </button>
        ) : null}
      </div>
    );
  }

  if (snapshot.room.phase === 'closed') {
    return (
      <div className="game-room-shell">
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <section className="room-closed" aria-labelledby="room-closed-title">
          <p className="connection-home__kicker">对局已结束</p>
          <h1 id="room-closed-title">房间已关闭</h1>
          <p>{snapshot.room.roomName} 已由房主关闭，牌局数据已保存。</p>
          <div className="room-closed__actions">
            <button
              className="button button--primary"
              type="button"
              onClick={() => {
                setStatisticsCollapsed(false);
                setStatisticsOpen(true);
              }}
            >
              查看最终统计
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => onExited?.('closed')}
            >
              返回联机首页
            </button>
          </div>
        </section>
        <StatisticsPanel
          open={statisticsOpen}
          players={statistics}
          titles={snapshot.statistics.titles}
          collapsed={statisticsCollapsed}
          onCollapse={() => setStatisticsCollapsed(true)}
          onExpand={() => setStatisticsCollapsed(false)}
        />
      </div>
    );
  }

  const game = snapshot.game;
  const gameSettlement = game?.settlement;
  const settlementHandTypes = new Map(
    gameSettlement?.showdownResults.map((result) => [
      result.playerId,
      handTypeLabels[result.handType] ?? result.handType,
    ]) ?? [],
  );
  const settlementBestFiveCards = new Map(
    gameSettlement?.showdownResults.map((result) => [
      result.playerId,
      result.bestFiveCards,
    ]) ?? [],
  );
  const settlementHoleCards = new Map(
    game ? Object.entries(game.showdownHoleCards) : [],
  );
  const settlementView = gameSettlement
    ? {
        handId: game.handId,
        reason: gameSettlement.reason,
        communityCards: game.communityCards,
        totalPot: game.totalPot,
        streetPots: game.streetPots,
        players: snapshot.room.players.map((player) => {
          const handType = settlementHandTypes.get(player.playerId);
          const bestFiveCards = settlementBestFiveCards.get(player.playerId);
          const holeCards = settlementHoleCards.get(player.playerId);
          const voluntarilyRevealedHoleCards =
            gameSettlement.voluntaryRevealedHoleCards[player.playerId];
          return {
            playerId: player.playerId,
            nickname: player.nickname,
            chips: player.chips,
            netChange: gameSettlement.netChanges[player.playerId] ?? 0,
            ...(handType ? { handType } : {}),
            ...(holeCards ? { holeCards } : {}),
            ...(bestFiveCards ? { bestFiveCards } : {}),
            ...(voluntarilyRevealedHoleCards
              ? { voluntarilyRevealedHoleCards }
              : {}),
          };
        }),
      }
    : null;
  const canShowOwnHoleCards = Boolean(
    snapshot.handReady &&
    gameSettlement &&
    game.ownHoleCards &&
    !gameSettlement.voluntaryRevealedHoleCards[session.playerId] &&
    !gameSettlement.showdownResults.some(
      (result) => result.playerId === session.playerId,
    ),
  );
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
          snapshot.room.phase === 'paused'
            ? '游戏暂停中'
            : game
              ? `第 1 局 · 第 ${snapshot.room.completedHands + 1} 手 · ${streetLabels[game.street]}${actionActor ? ` · 当前行动：${actionActor.nickname}` : ''}`
              : '等待牌局开始'
        }
        status={
          <TableUtilityToolbar
            activePanel={activeUtilityPanel}
            isHost={own?.isHost ?? false}
            onOpenPanel={openUtilityPanel}
            exitRoomDisabled={sending}
            onExitRoom={
              own?.isHost
                ? undefined
                : () => {
                    void send({ type: 'room.exit' }).then((accepted) => {
                      if (accepted) onExited?.('left');
                    });
                  }
            }
          />
        }
        seats={
          <TableSeats
            actionRoundKey={game ? `${game.handId}:${game.street}` : null}
            ownPlayerId={session.playerId}
            players={snapshot.room.players.map((player) => ({
              ...player,
              ...(gameSettlement
                ? (() => {
                    const handType = settlementHandTypes.get(player.playerId);
                    return {
                      settlement: {
                        netChange:
                          gameSettlement.netChanges[player.playerId] ?? 0,
                        ...(handType ? { handType } : {}),
                      },
                    };
                  })()
                : {}),
              isCurrentActor:
                snapshot.room.phase !== 'paused' &&
                game?.currentActorId === player.playerId,
              isDealer: game?.buttonPlayerId === player.playerId,
              isSmallBlind: game?.smallBlindPlayerId === player.playerId,
              isBigBlind: game?.bigBlindPlayerId === player.playerId,
            }))}
          />
        }
        communityCards={
          gameSettlement ? null : (
            <CardsAndPots
              communityCards={game?.communityCards ?? []}
              totalPot={game?.totalPot ?? 0}
              streetPots={game?.streetPots ?? []}
              currentStreet={game?.street}
              ownHoleCards={game?.ownHoleCards ?? null}
            />
          )
        }
        actionTimer={
          snapshot.room.phase !== 'paused' &&
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
              ownChips={own?.chips ?? 0}
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
              {...(canShowOwnHoleCards
                ? {
                    onShowHoleCards: () =>
                      void send({ type: 'game.show-hole-cards' }),
                  }
                : {})}
              requestToReview={incomingChipRequestView}
              onApproveRequest={(requestId) =>
                sendChipIntent({ type: 'approve', requestId })
              }
              onRejectRequest={(requestId) =>
                sendChipIntent({ type: 'reject', requestId })
              }
              settlement={settlementView}
            />
          ) : null
        }
        chipFlights={
          <PotChipFlights
            flights={potChipFlights}
            onFlightEnd={dismissPotChipFlight}
          />
        }
        utilityPanel={
          activeUtilityPanel === 'chip-exchange' ? (
            <ChipExchangePanel
              presentation="drawer"
              open
              onOpenChange={(open) => {
                if (!open) closeUtilityPanel();
              }}
              phase={snapshot.room.phase}
              currentPlayerId={session.playerId}
              players={snapshot.room.players}
              records={snapshot.chipActivity}
              onAction={sendChipIntent}
            />
          ) : activeUtilityPanel === 'host' ? (
            <HostControls
              presentation="drawer"
              open
              onOpenChange={(open) => {
                if (!open) closeUtilityPanel();
              }}
              isHost={own?.isHost ?? false}
              hostPlayerId={
                snapshot.room.players.find(({ isHost }) => isHost)?.playerId ??
                ''
              }
              phase={snapshot.room.phase}
              players={snapshot.room.players.filter(
                ({ status }) => !['left', 'removed'].includes(status),
              )}
              onCommand={sendHostControl}
            />
          ) : activeUtilityPanel === 'statistics' ? (
            <StatisticsPanel
              open
              players={statistics}
              titles={snapshot.statistics.titles}
              onCollapse={closeUtilityPanel}
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
    </div>
  );
}
