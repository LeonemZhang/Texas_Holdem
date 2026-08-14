import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  PROTOCOL_VERSION,
  type HostManagementSnapshot,
  type RoomSessionResponse,
} from '@texas-holdem/protocol';

import { ConnectionGuard } from '../connection/ConnectionGuard.js';
import {
  type ConnectionAdapter,
  type ConnectionState,
} from '../connection/connection.js';
import { networkErrorMessage } from '../connection/error-message.js';
import { SocketIoConnectionAdapter } from '../connection/socket-io-adapter.js';
import { createRandomId } from '../random-id.js';
import { LobbyWaitingRoom } from './LobbyWaitingRoom.js';
import { HostSpectatorRoom } from './HostSpectatorRoom.js';

export interface HostConsoleProps {
  readonly session: RoomSessionResponse;
  readonly connectionFactory?: (
    session: RoomSessionResponse,
  ) => ConnectionAdapter;
  readonly onExited?: (reason: 'closed') => void;
  readonly onHostRoomClosed?: () => Promise<void>;
  readonly onCommandPortChange?: (
    port: ((command: Record<string, unknown>) => Promise<boolean>) | null,
  ) => void;
}

function defaultConnection(session: RoomSessionResponse): ConnectionAdapter {
  const url = new URL(session.joinUrl);
  return new SocketIoConnectionAdapter(url.origin, session.socketPath);
}

export function HostConsole({
  session,
  connectionFactory = defaultConnection,
  onExited,
  onHostRoomClosed,
  onCommandPortChange,
}: HostConsoleProps) {
  const connection = useMemo(
    () => connectionFactory(session),
    [connectionFactory, session],
  );
  const credentials = useMemo(
    () => ({
      protocolVersion: PROTOCOL_VERSION,
      roomId: session.roomId,
      playerId: session.playerId,
      token: session.token,
      sessionType: 'host' as const,
      hostId: session.hostId ?? session.playerId,
    }),
    [session.hostId, session.playerId, session.roomId, session.token],
  );
  const [snapshot, setSnapshot] = useState<HostManagementSnapshot | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: 'disconnected',
  });
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const latestSnapshot = useRef<HostManagementSnapshot | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopped = useRef(false);
  const closedNotified = useRef(false);
  const [screen, setScreen] = useState<'control' | 'spectator'>('control');

  const retry = useCallback(() => {
    if (stopped.current || retryTimer.current !== null) return;
    retryTimer.current = setTimeout(() => {
      retryTimer.current = null;
      void connect();
    }, 500);
  }, []);

  const connect = useCallback(async () => {
    if (stopped.current) return;
    setConnectionState({ status: 'connecting' });
    try {
      await connection.connect(credentials);
      setConnectionState({ status: 'connected' });
      setError(null);
      if (connection.requestHostResync) {
        const response = await connection.requestHostResync({
          protocolVersion: PROTOCOL_VERSION,
          roomId: session.roomId,
          playerId: session.playerId,
          hostId: credentials.hostId,
          sessionType: 'host',
          offset: latestSnapshot.current?.sequence ?? 0,
        });
        if (response.status === 'snapshot') {
          latestSnapshot.current = response.snapshot;
          setSnapshot(response.snapshot);
        }
      }
    } catch (reason) {
      const message = networkErrorMessage(
        reason instanceof Error ? reason.message : null,
      );
      setConnectionState({ status: 'recovering', reason: message });
      setError(message);
      retry();
    }
  }, [connection, credentials, retry, session.playerId, session.roomId]);

  useEffect(() => {
    stopped.current = false;
    const stopSnapshot = connection.onHostSnapshot?.((next) => {
      if (
        next.roomId !== session.roomId ||
        next.hostId !== credentials.hostId ||
        (latestSnapshot.current &&
          next.sequence < latestSnapshot.current.sequence)
      ) {
        return;
      }
      latestSnapshot.current = next;
      setSnapshot(next);
      setError(null);
      setConnectionState({ status: 'connected' });
    });
    const stopLost = connection.onConnectionLost((reason) => {
      setConnectionState({ status: 'recovering', reason });
      retry();
    });
    void connect();
    return () => {
      stopped.current = true;
      if (retryTimer.current !== null) clearTimeout(retryTimer.current);
      retryTimer.current = null;
      stopSnapshot?.();
      stopLost();
      connection.disconnect();
    };
  }, [connect, connection, credentials.hostId, retry, session.roomId]);

  const send = useCallback(
    async (command: Record<string, unknown>): Promise<boolean> => {
      const current = latestSnapshot.current;
      if (!current || connectionState.status !== 'connected' || sending) {
        return false;
      }
      setSending(true);
      try {
        const response = await connection.sendCommand({
          ...command,
          protocolVersion: PROTOCOL_VERSION,
          commandId: createRandomId(),
          roomId: session.roomId,
          playerId: session.playerId,
          actorType: 'host',
          expectedVersion: current.stateVersion,
        });
        if (response.status !== 'accepted') {
          setError(response.error.message);
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
    [
      connection,
      connectionState.status,
      sending,
      session.playerId,
      session.roomId,
    ],
  );

  useEffect(() => {
    onCommandPortChange?.(snapshot ? send : null);
    return () => onCommandPortChange?.(null);
  }, [onCommandPortChange, send, snapshot]);

  useEffect(() => {
    if (
      snapshot?.room.phase !== 'closed' ||
      closedNotified.current ||
      !onExited
    ) {
      return;
    }
    closedNotified.current = true;
    const stopping = onHostRoomClosed?.();
    if (stopping) {
      void stopping.finally(() => onExited('closed'));
    } else {
      onExited('closed');
    }
  }, [onExited, onHostRoomClosed, snapshot?.room.phase]);

  useEffect(() => {
    if (
      snapshot &&
      snapshot.room.phase !== 'lobby' &&
      snapshot.room.phase !== 'closed'
    ) {
      setScreen('spectator');
    }
  }, [snapshot?.room.phase]);

  const guardState =
    connectionState.status === 'connected' && !snapshot
      ? { status: 'recovering' as const, reason: '正在等待房主管理快照' }
      : connectionState;

  if (!snapshot) {
    return (
      <ConnectionGuard state={guardState} onRetry={() => void connect()}>
        <section className="game-room-loading" aria-live="polite">
          <h2>正在连接房主控制台</h2>
          <p>{error ?? '正在获取房间管理状态…'}</p>
        </section>
      </ConnectionGuard>
    );
  }

  if (screen === 'spectator') {
    return (
      <ConnectionGuard state={guardState} onRetry={() => void connect()}>
        <HostSpectatorRoom
          snapshot={snapshot}
          onBack={() => setScreen('control')}
          joinUrl={session.joinUrl}
          onCommand={(intent) => void send(intent)}
        />
      </ConnectionGuard>
    );
  }

  return (
    <ConnectionGuard state={guardState} onRetry={() => void connect()}>
      <main
        className="game-room-shell host-console"
        aria-label="房主控制台"
        aria-busy={sending}
      >
        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}
        <LobbyWaitingRoom
          roomName={snapshot.room.roomName}
          players={snapshot.room.players
            .filter((player) => !['left', 'removed'].includes(player.status))
            .map((player) => ({
              playerId: player.playerId,
              nickname: player.nickname,
              seatIndex: player.seatIndex,
              isHost: false,
              ready: player.lobbyReady,
              connected: player.status !== 'disconnected',
            }))}
          joinUrl={session.joinUrl}
          settings={snapshot.room.settings}
          currentSmallBlind={snapshot.room.currentSmallBlind}
          isHost
          phase={snapshot.room.phase}
          onUpdateSettings={(settings, currentSmallBlind) =>
            void send({
              type: 'room.update-settings',
              settings,
              ...(currentSmallBlind === undefined ? {} : { currentSmallBlind }),
            })
          }
          onStartFirstHand={() =>
            void send({
              type: 'room.start-first-hand',
              handId: createRandomId(),
            })
          }
          onEnterSpectator={() => setScreen('spectator')}
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
      </main>
    </ConnectionGuard>
  );
}
