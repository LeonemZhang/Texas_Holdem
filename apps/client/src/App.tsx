import { PageShell } from '@texas-holdem/ui';
import { useEffect, useState, type FormEvent } from 'react';

import type { RoomSessionResponse } from '@texas-holdem/protocol';

import {
  browserReconnectSessionStore,
  type StoredReconnectSession,
} from './connection/reconnect-session-store.js';
import { RoomSessionClient } from './connection/room-session-client.js';
import { ConnectionHome } from './home/ConnectionHome.js';
import { NetworkDiagnostics } from './home/NetworkDiagnostics.js';
import {
  RoomDiscoveryList,
  type RoomDiscoveryListItem,
} from './home/RoomDiscoveryList.js';
import { DesktopRoomSetup } from './room/DesktopRoomSetup.js';
import { GameRoom } from './room/GameRoom.js';
import {
  getRuntimeAdapter,
  type HostServiceInfo,
  type RuntimeInfo,
} from './runtime.js';
import { UiSmokePreview } from './test/UiSmokePreview.js';

interface JoinTarget {
  readonly baseUrl: string;
  readonly roomId: string;
}

function roomSessionFromStored(
  stored: StoredReconnectSession,
): RoomSessionResponse {
  return {
    protocolVersion: stored.protocolVersion,
    roomId: stored.roomId,
    playerId: stored.playerId,
    token: stored.token,
    joinUrl: stored.joinUrl,
    socketPath: '/socket.io',
  };
}

export function App() {
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [rooms, setRooms] = useState<readonly RoomDiscoveryListItem[]>([]);
  const [refreshingRooms, setRefreshingRooms] = useState(false);
  const [hostService, setHostService] = useState<HostServiceInfo | null>(null);
  const [joinTarget, setJoinTarget] = useState<JoinTarget | null>(null);
  const [session, setSession] = useState<RoomSessionResponse | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const adapter = getRuntimeAdapter();

  useEffect(() => {
    void adapter.getRuntimeInfo().then(setRuntime);
    const roomId = new URLSearchParams(window.location.search).get('room');
    if (roomId) {
      const stored = browserReconnectSessionStore().load(roomId);
      if (stored) setSession(roomSessionFromStored(stored));
      else setJoinTarget({ baseUrl: window.location.origin, roomId });
    }
    const stopPlayerExit = adapter.onPlayerExitRequested(async () => {
      // GameRoom performs the explicit exit from its own action.
    });
    const stopHostClose = adapter.onHostCloseRequested(async () => {
      await adapter.stopHostService();
    });
    return () => {
      stopPlayerExit();
      stopHostClose();
    };
  }, []);

  const saveSession = (created: RoomSessionResponse, isHost: boolean) => {
    browserReconnectSessionStore().save({
      protocolVersion: created.protocolVersion,
      roomId: created.roomId,
      playerId: created.playerId,
      token: created.token,
      joinUrl: created.joinUrl,
    });
    setSession(created);
    setJoinTarget(null);
    void adapter.setWindowRoomContext({ inRoom: true, isHost });
  };

  const selectHost = async (address: string) => {
    setJoinError(null);
    try {
      const url = new URL(address);
      const roomId =
        url.searchParams.get('room') ??
        (await new RoomSessionClient(url.origin).currentRoomId());
      setJoinTarget({ baseUrl: url.origin, roomId });
    } catch (reason) {
      setJoinError(reason instanceof Error ? reason.message : '无法连接房主');
    }
  };

  const join = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!joinTarget) return;
    const nickname = String(
      new FormData(event.currentTarget).get('nickname') ?? '',
    ).trim();
    if (!nickname) {
      setJoinError('请输入昵称');
      return;
    }
    try {
      const joined = await new RoomSessionClient(joinTarget.baseUrl).join(
        joinTarget.roomId,
        { nickname },
      );
      saveSession(joined, false);
    } catch (reason) {
      setJoinError(reason instanceof Error ? reason.message : '加入房间失败');
    }
  };

  const refreshRooms = async () => {
    setRefreshingRooms(true);
    try {
      const discovered = await adapter.scanLanRooms({
        requestId: crypto.randomUUID(),
        discoveryPort: 32_101,
      });
      setRooms(
        discovered.map((room) => ({
          room,
          compatibility: 'compatible',
          latencyMs: null,
          expired: false,
        })),
      );
    } finally {
      setRefreshingRooms(false);
    }
  };

  const preview = import.meta.env.DEV
    ? new URLSearchParams(window.location.search).get('preview')
    : null;
  if (preview) return <UiSmokePreview page={preview} />;

  if (session) {
    return (
      <GameRoom
        session={session}
        onExited={() => {
          browserReconnectSessionStore().clear(session.roomId);
          setSession(null);
          void adapter.setWindowRoomContext({ inRoom: false, isHost: false });
        }}
      />
    );
  }

  return (
    <PageShell
      title="Texas Hold'em"
      subtitle="面向朋友局域网对战的桌面房主与多端玩家框架"
    >
      <ConnectionHome
        runtimeKind={runtime?.kind ?? 'browser'}
        onCreateRoom={() => setCreatingRoom(true)}
        onRefreshRooms={() => void refreshRooms()}
        onJoinAddress={(address) => void selectHost(address)}
      />
      {runtime?.kind === 'desktop' && creatingRoom ? (
        <DesktopRoomSetup
          runtime={adapter}
          onHosted={async (service, room) => {
            const created = await new RoomSessionClient(service.joinUrl).create(
              room,
            );
            saveSession(created, true);
            const configured = { ...service, joinUrl: created.joinUrl };
            setHostService(configured);
            return configured;
          }}
        />
      ) : null}
      {runtime?.kind === 'desktop' ? (
        <>
          <RoomDiscoveryList
            rooms={rooms}
            refreshing={refreshingRooms}
            onRefresh={() => void refreshRooms()}
            onJoin={(room) =>
              void selectHost(`http://${room.hostAddress}:${room.httpPort}`)
            }
          />
          <NetworkDiagnostics runtime={adapter} hostService={hostService} />
        </>
      ) : null}
      {joinTarget ? (
        <form className="nickname-join" onSubmit={(event) => void join(event)}>
          <h2>加入房间</h2>
          <label>
            玩家昵称
            <input name="nickname" defaultValue="Bob" autoComplete="nickname" />
          </label>
          <button className="button button--primary" type="submit">
            确认加入
          </button>
        </form>
      ) : null}
      {joinError ? (
        <p className="form-error" role="alert">
          {joinError}
        </p>
      ) : null}
    </PageShell>
  );
}
