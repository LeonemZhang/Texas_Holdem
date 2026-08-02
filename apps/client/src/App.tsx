import { PageShell } from '@texas-holdem/ui';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import type { RoomSessionResponse } from '@texas-holdem/protocol';

import {
  browserReconnectSessionStore,
  type StoredReconnectSession,
} from './connection/reconnect-session-store.js';
import {
  RoomSessionClient,
  RoomSessionRequestError,
} from './connection/room-session-client.js';
import { networkErrorMessage } from './connection/error-message.js';
import { ConnectionHome } from './home/ConnectionHome.js';
import { NetworkDiagnostics } from './home/NetworkDiagnostics.js';
import {
  RoomDiscoveryList,
  type RoomDiscoveryListItem,
} from './home/RoomDiscoveryList.js';
import { DesktopRoomSetup } from './room/DesktopRoomSetup.js';
import { GameRoom } from './room/GameRoom.js';
import { RoomRecordManager } from './room/RoomRecordManager.js';
import {
  getRuntimeAdapter,
  type HostServiceInfo,
  type RuntimeInfo,
} from './runtime.js';
import { createRandomId } from './random-id.js';
import { UiSmokePreview } from './test/UiSmokePreview.js';

interface JoinTarget {
  readonly baseUrl: string;
  readonly roomId: string;
}

type DesktopSetupMode = 'create' | 'records';

export function rememberBrowserRoomInUrl(roomId: string): void {
  const roomUrl = new URL(window.location.href);
  roomUrl.searchParams.set('room', roomId);
  window.history.replaceState(null, '', roomUrl);
}

export function forgetBrowserRoomInUrl(roomId: string): void {
  const roomUrl = new URL(window.location.href);
  if (roomUrl.searchParams.get('room') !== roomId) return;
  roomUrl.searchParams.delete('room');
  window.history.replaceState(null, '', roomUrl);
}

function roomSessionFromStored(
  stored: StoredReconnectSession,
  joinUrl = stored.joinUrl,
): RoomSessionResponse {
  return {
    protocolVersion: stored.protocolVersion,
    roomId: stored.roomId,
    playerId: stored.playerId,
    token: stored.token,
    joinUrl,
    socketPath: '/socket.io',
  };
}

export function App() {
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [desktopSetupMode, setDesktopSetupMode] =
    useState<DesktopSetupMode | null>(null);
  const [rooms, setRooms] = useState<readonly RoomDiscoveryListItem[]>([]);
  const [refreshingRooms, setRefreshingRooms] = useState(false);
  const [hostService, setHostService] = useState<HostServiceInfo | null>(null);
  const [managingRecords, setManagingRecords] = useState(false);
  const [joinTarget, setJoinTarget] = useState<JoinTarget | null>(null);
  const [session, setSession] = useState<RoomSessionResponse | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const roomCommand = useRef<
    ((command: Record<string, unknown>) => Promise<boolean>) | null
  >(null);
  const adapter = getRuntimeAdapter();

  useEffect(() => {
    void adapter.getRuntimeInfo().then(setRuntime);
    if (typeof adapter.getActiveHostService === 'function') {
      void adapter.getActiveHostService().then(setHostService);
    }
    const roomId = new URLSearchParams(window.location.search).get('room');
    if (roomId) {
      const stored = browserReconnectSessionStore().load(roomId);
      if (stored) {
        void new RoomSessionClient(window.location.origin)
          .currentRoomId()
          .then((activeRoomId) => {
            if (activeRoomId === roomId) {
              const joinUrl = new URL(window.location.origin);
              joinUrl.searchParams.set('room', roomId);
              setSession(roomSessionFromStored(stored, joinUrl.toString()));
              return;
            }
            browserReconnectSessionStore().clear(roomId);
            forgetBrowserRoomInUrl(roomId);
            setJoinError('该房间已结束，已回到加入房间页面。');
          })
          .catch((reason: unknown) => {
            if (
              reason instanceof RoomSessionRequestError &&
              reason.status === 404
            ) {
              browserReconnectSessionStore().clear(roomId);
              forgetBrowserRoomInUrl(roomId);
              setJoinError('该房间已结束，已回到加入房间页面。');
              return;
            }
            const joinUrl = new URL(window.location.origin);
            joinUrl.searchParams.set('room', roomId);
            setSession(roomSessionFromStored(stored, joinUrl.toString()));
          });
      } else setJoinTarget({ baseUrl: window.location.origin, roomId });
    } else if (!window.texasHoldemDesktop) {
      void new RoomSessionClient(window.location.origin)
        .currentRoomId()
        .then((activeRoomId) =>
          setJoinTarget({
            baseUrl: window.location.origin,
            roomId: activeRoomId,
          }),
        )
        .catch(() => undefined);
    }
    const stopPlayerExit = adapter.onPlayerExitRequested(async () => {
      await roomCommand.current?.({ type: 'room.exit' });
    });
    const stopHostClose = adapter.onHostCloseRequested(async () => {
      await roomCommand.current?.({ type: 'room.close' });
      await adapter.stopHostService();
    });
    const stopHostExit = adapter.onHostServiceExited(() => {
      setHostService(null);
      setManagingRecords(false);
    });
    return () => {
      stopPlayerExit();
      stopHostClose();
      stopHostExit();
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
    if (!window.texasHoldemDesktop) {
      rememberBrowserRoomInUrl(created.roomId);
    }
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
      const stored = browserReconnectSessionStore().load(roomId);
      if (stored) {
        const joinUrl = new URL(url.origin);
        joinUrl.searchParams.set('room', roomId);
        saveSession(roomSessionFromStored(stored, joinUrl.toString()), false);
        return;
      }
      setJoinTarget({ baseUrl: url.origin, roomId });
    } catch (reason) {
      setJoinError(networkErrorMessage(reason instanceof Error ? reason.message : null));
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
      const message = reason instanceof Error ? reason.message : null;
      setJoinError(
        message === 'Room is not accepting new players'
          ? '对局已经开始：只有原玩家可使用本机保存的身份恢复，不能以新昵称加入。'
          : networkErrorMessage(message),
      );
    }
  };

  const refreshRooms = async () => {
    setRefreshingRooms(true);
    try {
      const discovered = await adapter.scanLanRooms({
        requestId: createRandomId(),
        discoveryPort: 32_101,
      });
      setRooms(
        discovered.map((room) => ({
          room,
          compatibility: 'compatible',
          latencyMs: null,
          expired: false,
          reconnectable:
            browserReconnectSessionStore().load(room.roomId) !== null,
        })),
      );
    } finally {
      setRefreshingRooms(false);
    }
  };

  const openCreateRoom = () => {
    setManagingRecords(false);
    setDesktopSetupMode('create');
  };

  const openRecordManager = () => {
    if (hostService) {
      setDesktopSetupMode(null);
      setManagingRecords(true);
      return;
    }
    setDesktopSetupMode('records');
  };

  const desktopPanelOpen = desktopSetupMode !== null || managingRecords;

  const preview = import.meta.env.DEV
    ? new URLSearchParams(window.location.search).get('preview')
    : null;
  if (preview) return <UiSmokePreview page={preview} />;

  if (session) {
    return (
      <GameRoom
        session={session}
        onCommandPortChange={(port) => {
          roomCommand.current = port;
        }}
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
      {runtime?.kind === 'desktop' && managingRecords ? (
        <RoomRecordManager
          runtime={adapter}
          onCreateRoom={openCreateRoom}
          onClose={() => setManagingRecords(false)}
          onRecovered={(recovered) => {
            setManagingRecords(false);
            saveSession(recovered, true);
          }}
        />
      ) : null}
      {!desktopPanelOpen ? (
        <ConnectionHome
          runtimeKind={runtime?.kind ?? 'browser'}
          onCreateRoom={openCreateRoom}
          onManageRecords={openRecordManager}
          onRefreshRooms={() => void refreshRooms()}
          onJoinAddress={(address) => void selectHost(address)}
        />
      ) : null}
      {runtime?.kind === 'desktop' && desktopSetupMode ? (
        <DesktopRoomSetup
          runtime={adapter}
          mode={desktopSetupMode}
          existingService={hostService}
          onClose={() => setDesktopSetupMode(null)}
          onHosted={async (service, room) => {
            const created = await new RoomSessionClient(service.joinUrl).create(
              room,
            );
            saveSession(created, true);
            const configured = { ...service, joinUrl: created.joinUrl };
            setHostService(configured);
            return configured;
          }}
          onManageRecords={async (service) => {
            setHostService(service);
            setDesktopSetupMode(null);
            setManagingRecords(true);
          }}
        />
      ) : null}
      {runtime?.kind === 'desktop' && !desktopPanelOpen ? (
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
