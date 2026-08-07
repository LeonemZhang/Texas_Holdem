import { PageShell } from '@texas-holdem/ui';
import { useEffect, useRef, useState } from 'react';

import type { RoomSessionResponse } from '@texas-holdem/protocol';

import { browserReconnectSessionStore } from './connection/reconnect-session-store.js';
import {
  RoomSessionClient,
  RoomSessionRequestError,
} from './connection/room-session-client.js';
import { networkErrorMessage } from './connection/error-message.js';
import { ConnectionHome } from './home/ConnectionHome.js';
import { DiscoveryJoinDialog } from './home/DiscoveryJoinDialog.js';
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
  type RoomRecordSummary,
  type RuntimeInfo,
} from './runtime.js';
import { createRandomId } from './random-id.js';
import { UiSmokePreview } from './test/UiSmokePreview.js';

interface JoinTarget {
  readonly baseUrl: string;
  readonly roomId: string;
}

interface PendingLobbyResume {
  readonly roomId: string;
  readonly nickname: string;
}

type DesktopSetupMode = 'create';
type HomeDataPage = 'discovery' | 'diagnostics';

function isIpv4Host(hostname: string): boolean {
  const parts = hostname.split('.');
  return (
    parts.length === 4 &&
    parts.every((part) => {
      const value = Number(part);
      return /^\d{1,3}$/.test(part) && value >= 0 && value <= 255;
    })
  );
}

export function browserAddressFromUrl(url: URL): string {
  return isIpv4Host(url.hostname) ? url.host : '';
}

function inviteAddressFromLocation(): string {
  if (window.texasHoldemDesktop) return '';
  return browserAddressFromUrl(new URL(window.location.href));
}

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

export function App() {
  const [runtime, setRuntime] = useState<RuntimeInfo | null>(null);
  const [desktopSetupMode, setDesktopSetupMode] =
    useState<DesktopSetupMode | null>(null);
  const [rooms, setRooms] = useState<readonly RoomDiscoveryListItem[]>([]);
  const [discoveryJoinRoom, setDiscoveryJoinRoom] = useState<
    RoomDiscoveryListItem['room'] | null
  >(null);
  const [joiningDiscoveredRoom, setJoiningDiscoveredRoom] = useState(false);
  const [refreshingRooms, setRefreshingRooms] = useState(false);
  const [hostService, setHostService] = useState<HostServiceInfo | null>(null);
  const [runningRoomRecord, setRunningRoomRecord] =
    useState<RoomRecordSummary | null>(null);
  const [recoveringRunningRoom, setRecoveringRunningRoom] = useState(false);
  const [runningRoomRecoveryError, setRunningRoomRecoveryError] = useState<
    string | null
  >(null);
  const [managingRecords, setManagingRecords] = useState(false);
  const [homeDataPage, setHomeDataPage] = useState<HomeDataPage | null>(null);
  const [joinTarget, setJoinTarget] = useState<JoinTarget | null>(null);
  const [pendingLobbyResume, setPendingLobbyResume] =
    useState<PendingLobbyResume | null>(null);
  const [session, setSession] = useState<RoomSessionResponse | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const roomCommand = useRef<
    ((command: Record<string, unknown>) => Promise<boolean>) | null
  >(null);
  const adapter = getRuntimeAdapter();

  function saveSession(created: RoomSessionResponse, isHost: boolean): void {
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
    setPendingLobbyResume(null);
    void adapter.setWindowRoomContext({ inRoom: true, isHost });
  }

  async function restoreStoredSession(
    baseUrl: string,
    roomId: string,
  ): Promise<boolean> {
    const stored = browserReconnectSessionStore().load(roomId);
    if (!stored) return false;
    try {
      const restored = await new RoomSessionClient(baseUrl).resume(roomId, {
        playerId: stored.playerId,
        token: stored.token,
      });
      saveSession(restored, false);
      return true;
    } catch (reason) {
      if (
        reason instanceof RoomSessionRequestError &&
        reason.code === 'PLAYER_REMOVED'
      ) {
        browserReconnectSessionStore().clear(roomId);
        forgetBrowserRoomInUrl(roomId);
        setJoinTarget(null);
        setJoinError('你已被房主移出房间，无法重新加入本场对局。');
        return true;
      }
      if (
        reason instanceof RoomSessionRequestError &&
        (reason.status === 401 || reason.status === 404)
      ) {
        browserReconnectSessionStore().clear(roomId);
        if (reason.status === 404) forgetBrowserRoomInUrl(roomId);
        return false;
      }
      setJoinError(
        networkErrorMessage(reason instanceof Error ? reason.message : null),
      );
      return true;
    }
  }

  useEffect(() => {
    void adapter.getRuntimeInfo().then((info) => {
      setRuntime(info);
      if (info.kind === 'desktop') {
        void adapter
          .openRoomRecordManager()
          .then(() => setManagingRecords(true))
          .catch(() => setJoinError('读取对局记录失败，请重试。'));
      }
    });
    if (typeof adapter.getActiveHostService === 'function') {
      void adapter.getActiveHostService().then(setHostService);
    }
    const roomId = new URLSearchParams(window.location.search).get('room');
    if (roomId) {
      void new RoomSessionClient(window.location.origin)
        .currentRoomId()
        .then(async (activeRoomId) => {
          if (activeRoomId === roomId) {
            if (await restoreStoredSession(window.location.origin, roomId))
              return;
            setJoinTarget({ baseUrl: window.location.origin, roomId });
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
          setJoinError(
            networkErrorMessage(
              reason instanceof Error ? reason.message : null,
            ),
          );
        });
    } else if (!window.texasHoldemDesktop) {
      void new RoomSessionClient(window.location.origin)
        .currentRoomId()
        .then(async (activeRoomId) => {
          if (
            await restoreStoredSession(window.location.origin, activeRoomId)
          ) {
            return;
          }
          setJoinTarget({
            baseUrl: window.location.origin,
            roomId: activeRoomId,
          });
        })
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

  useEffect(() => {
    if (runtime?.kind !== 'desktop' || !hostService) {
      setRunningRoomRecord(null);
      setRunningRoomRecoveryError(null);
      return;
    }
    let disposed = false;
    void adapter
      .listRoomRecords(false)
      .then((records) => {
        if (disposed) return;
        setRunningRoomRecord(
          records.find((record) => record.status === 'running') ?? null,
        );
      })
      .catch(() => {
        if (!disposed) setRunningRoomRecord(null);
      });
    return () => {
      disposed = true;
    };
  }, [adapter, hostService, runtime?.kind]);

  const resolveJoinTarget = async (
    address: string,
  ): Promise<JoinTarget | null> => {
    setJoinError(null);
    try {
      const url = new URL(address);
      const roomId =
        url.searchParams.get('room') ??
        (await new RoomSessionClient(url.origin).currentRoomId());
      return { baseUrl: url.origin, roomId };
    } catch (reason) {
      setJoinError(
        networkErrorMessage(reason instanceof Error ? reason.message : null),
      );
      return null;
    }
  };

  const selectHost = async (address: string): Promise<boolean> => {
    const target = await resolveJoinTarget(address);
    if (!target) return false;
    if (pendingLobbyResume?.roomId === target.roomId) {
      setJoinTarget(target);
      return true;
    }
    if (await restoreStoredSession(target.baseUrl, target.roomId)) return false;
    setJoinTarget(target);
    return true;
  };

  const join = async (
    nickname: string,
    target: JoinTarget | null = joinTarget,
  ): Promise<boolean> => {
    if (!target) return false;
    if (!nickname) {
      setJoinError('请输入昵称');
      return false;
    }
    try {
      const client = new RoomSessionClient(target.baseUrl);
      const pendingResume =
        pendingLobbyResume?.roomId === target.roomId
          ? pendingLobbyResume
          : null;
      let joined: RoomSessionResponse;
      if (pendingResume) {
        const stored = browserReconnectSessionStore().load(target.roomId);
        if (!stored) {
          setPendingLobbyResume(null);
          setJoinTarget(null);
          setJoinError('本机恢复身份已失效，请重新加入房间。');
          return false;
        }
        joined = await client.resume(target.roomId, {
          playerId: stored.playerId,
          token: stored.token,
          nickname,
        });
      } else {
        joined = await client.join(target.roomId, { nickname });
      }
      saveSession(joined, false);
      return true;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : null;
      if (
        reason instanceof RoomSessionRequestError &&
        reason.code === 'PLAYER_REMOVED'
      ) {
        browserReconnectSessionStore().clear(target.roomId);
        forgetBrowserRoomInUrl(target.roomId);
        setPendingLobbyResume(null);
        setJoinTarget(null);
        setJoinError('你已被房主移出房间，无法重新加入本场对局。');
        return false;
      }
      setJoinError(
        message === 'Room is not accepting new players'
          ? '对局已经开始：只有原玩家可使用本机保存的身份恢复，不能以新昵称加入。'
          : message?.startsWith('Nickname already exists:')
            ? '该昵称已被房间中的其他玩家使用，请更换昵称。'
            : networkErrorMessage(message),
      );
      return false;
    }
  };

  const joinDiscoveredRoom = async (nickname: string) => {
    const room = discoveryJoinRoom;
    if (!room || joiningDiscoveredRoom) return;
    setJoiningDiscoveredRoom(true);
    try {
      const target = await resolveJoinTarget(
        `http://${room.hostAddress}:${room.httpPort}`,
      );
      if (!target) return;
      if (
        pendingLobbyResume?.roomId !== target.roomId &&
        (await restoreStoredSession(target.baseUrl, target.roomId))
      ) {
        setDiscoveryJoinRoom(null);
        return;
      }
      setJoinTarget(target);
      if (await join(nickname, target)) setDiscoveryJoinRoom(null);
    } finally {
      setJoiningDiscoveredRoom(false);
    }
  };

  const refreshRooms = async () => {
    setHomeDataPage('discovery');
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

  const openCreateRoom = (hostServiceStopped = false) => {
    setHomeDataPage(null);
    setManagingRecords(false);
    if (hostServiceStopped) setHostService(null);
    setDesktopSetupMode('create');
  };

  const openRecordManager = () => {
    setHomeDataPage(null);
    void adapter
      .openRoomRecordManager()
      .then(() => {
        setDesktopSetupMode(null);
        setManagingRecords(true);
      })
      .catch(() => setJoinError('读取对局记录失败，请重试。'));
  };

  const recoverRunningRoom = async () => {
    if (!runningRoomRecord || recoveringRunningRoom) return;
    try {
      setRecoveringRunningRoom(true);
      setRunningRoomRecoveryError(null);
      const recovered = await adapter.recoverRoomRecord({
        roomId: runningRoomRecord.roomId,
      });
      saveSession(recovered, true);
    } catch (reason) {
      setRunningRoomRecoveryError(
        reason instanceof Error ? reason.message : '恢复对局失败，请重试。',
      );
    } finally {
      setRecoveringRunningRoom(false);
    }
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
        onExited={(reason, details) => {
          if (reason === 'closed' || reason === 'removed') {
            browserReconnectSessionStore().clear(session.roomId);
            forgetBrowserRoomInUrl(session.roomId);
          }
          setPendingLobbyResume(
            reason === 'left' && details?.canChangeNickname
              ? {
                  roomId: session.roomId,
                  nickname: details.nickname ?? '',
                }
              : null,
          );
          setJoinTarget(null);
          if (reason === 'removed') {
            setJoinError('你已被房主移出房间，无法重新加入本场对局。');
          } else {
            setJoinError(null);
          }
          setSession(null);
          void adapter.setWindowRoomContext({ inRoom: false, isHost: false });
        }}
        {...(runtime?.kind === 'desktop'
          ? { onHostRoomClosed: () => adapter.stopHostService() }
          : {})}
      />
    );
  }

  return (
    <PageShell title="Texas Hold'em" subtitle="私人局域网德州牌桌">
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
      {!desktopPanelOpen && !homeDataPage ? (
        <ConnectionHome
          runtimeKind={runtime?.kind ?? 'browser'}
          initialAddress={inviteAddressFromLocation()}
          onCreateRoom={openCreateRoom}
          onManageRecords={openRecordManager}
          onRefreshRooms={() => void refreshRooms()}
          {...(runtime?.kind === 'desktop'
            ? { onOpenDiagnostics: () => setHomeDataPage('diagnostics') }
            : {})}
          joinReady={joinTarget !== null}
          {...(pendingLobbyResume
            ? { initialNickname: pendingLobbyResume.nickname }
            : {})}
          resumeNicknameChange={pendingLobbyResume !== null}
          joinError={joinError}
          runningRoomRecord={runningRoomRecord}
          recoveringRunningRoom={recoveringRunningRoom}
          runningRoomRecoveryError={runningRoomRecoveryError}
          onRecoverRunningRoom={() => void recoverRunningRoom()}
          onProbeAddress={selectHost}
          onResetProbe={() => {
            setJoinError(null);
            setJoinTarget(null);
          }}
          onJoin={(nickname) => void join(nickname)}
        />
      ) : null}
      {runtime?.kind === 'desktop' && desktopSetupMode ? (
        <DesktopRoomSetup
          runtime={adapter}
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
          onRecovered={(recovered) => saveSession(recovered, true)}
        />
      ) : null}
      {runtime?.kind === 'desktop' && homeDataPage === 'discovery' ? (
        <section className="home-data-page" aria-label="附近牌桌">
          <div className="home-data-page__toolbar">
            <button
              className="button button--secondary"
              type="button"
              onClick={() => setHomeDataPage(null)}
            >
              返回大厅
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => void refreshRooms()}
            >
              刷新
            </button>
          </div>
          <RoomDiscoveryList
            rooms={rooms}
            refreshing={refreshingRooms}
            onRefresh={() => void refreshRooms()}
            onJoin={(room) => {
              const discoveredRoom = rooms.find(
                ({ room: candidate }) => candidate.roomId === room.roomId,
              );
              if (discoveredRoom?.reconnectable && room.phase !== 'lobby') {
                void selectHost(`http://${room.hostAddress}:${room.httpPort}`);
                return;
              }
              setJoinError(null);
              setDiscoveryJoinRoom(room);
            }}
          />
        </section>
      ) : null}
      {runtime?.kind === 'desktop' && homeDataPage === 'diagnostics' ? (
        <section className="home-data-page" aria-label="网络诊断">
          <div className="home-data-page__toolbar">
            <button
              className="button button--secondary"
              type="button"
              onClick={() => setHomeDataPage(null)}
            >
              返回大厅
            </button>
          </div>
          <NetworkDiagnostics runtime={adapter} hostService={hostService} />
        </section>
      ) : null}
      {joinError &&
      (desktopPanelOpen || (homeDataPage && !discoveryJoinRoom)) ? (
        <p className="form-error" role="alert">
          {joinError}
        </p>
      ) : null}
      {discoveryJoinRoom ? (
        <DiscoveryJoinDialog
          key={discoveryJoinRoom.roomId}
          roomName={discoveryJoinRoom.roomName}
          {...(pendingLobbyResume?.roomId === discoveryJoinRoom.roomId
            ? {
                initialNickname: pendingLobbyResume.nickname,
                resumeNicknameChange: true,
              }
            : {})}
          joining={joiningDiscoveredRoom}
          error={joinError}
          onCancel={() => {
            setDiscoveryJoinRoom(null);
            setJoinError(null);
          }}
          onConfirm={(nickname) => void joinDiscoveredRoom(nickname)}
        />
      ) : null}
    </PageShell>
  );
}
