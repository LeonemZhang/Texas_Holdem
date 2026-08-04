import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PROTOCOL_VERSION } from '@texas-holdem/protocol';
import type { RuntimeAdapter } from './runtime.js';

import {
  App,
  browserAddressFromUrl,
  forgetBrowserRoomInUrl,
  rememberBrowserRoomInUrl,
} from './App';
import { browserReconnectSessionStore } from './connection/reconnect-session-store.js';

vi.mock('./room/GameRoom.js', () => ({
  GameRoom: ({
    session,
    onExited,
  }: {
    readonly session: { readonly roomId: string };
    readonly onExited: (reason: 'removed') => void;
  }) => (
    <>
      <p>已恢复对局：{session.roomId}</p>
      <button type="button" onClick={() => onExited('removed')}>
        模拟被移出
      </button>
    </>
  ),
}));

function desktopRuntime(
  overrides: Partial<RuntimeAdapter> = {},
): RuntimeAdapter {
  return {
    getRuntimeInfo: async () => ({
      kind: 'desktop',
      appVersion: '0.0.0',
      platform: 'win32',
    }),
    openRoomRecordManager: async () => undefined,
    listNetworkInterfaces: async () => [],
    scanLanRooms: async () => [],
    startHostService: async () => ({
      port: 32_100,
      advertisedAddress: '10.126.126.1',
      joinUrl: 'http://10.126.126.1:32100',
      dataDirectory: 'rooms',
    }),
    getActiveHostService: async () => ({
      port: 32_100,
      advertisedAddress: '10.126.126.1',
      joinUrl: 'http://10.126.126.1:32100',
      dataDirectory: 'rooms',
    }),
    stopHostService: async () => undefined,
    listRoomRecords: async () => [],
    recoverRoomRecord: async () => ({
      protocolVersion: PROTOCOL_VERSION,
      roomId: 'running-room',
      playerId: 'host',
      token: 'host-recovery-token-123456',
      joinUrl: 'http://10.126.126.1:32100/?room=running-room',
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
    ...overrides,
  };
}

describe('application shell', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    window.localStorage.clear();
    delete window.texasHoldemDesktop;
    vi.unstubAllGlobals();
  });

  it('keeps the joined room id in the browser address for a later refresh', () => {
    rememberBrowserRoomInUrl('room-after-refresh');

    expect(new URL(window.location.href).searchParams.get('room')).toBe(
      'room-after-refresh',
    );
  });

  it('removes an ended remembered room and returns to the join page', async () => {
    const roomId = 'ended-room';
    window.history.replaceState(null, '', `/?room=${roomId}`);
    browserReconnectSessionStore().save({
      protocolVersion: PROTOCOL_VERSION,
      roomId,
      playerId: 'bob',
      token: 'bob-reconnect-token-123456',
      joinUrl: `http://host.test/?room=${roomId}`,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: { code: 'NOT_FOUND', message: '房主尚未创建房间' },
            }),
            { status: 404, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );

    render(<App />);

    await waitFor(() =>
      expect(
        screen.getByText('该房间已结束，已回到加入房间页面。'),
      ).toBeInTheDocument(),
    );
    expect(browserReconnectSessionStore().load(roomId)).toBeNull();
    expect(new URL(window.location.href).searchParams.get('room')).toBeNull();
  });

  it('removes only the matching room id from the browser address', () => {
    rememberBrowserRoomInUrl('room-1');
    forgetBrowserRoomInUrl('room-2');

    expect(new URL(window.location.href).searchParams.get('room')).toBe(
      'room-1',
    );
  });

  it('renders the browser join entry without desktop-only actions', async () => {
    render(<App />);

    expect(
      screen.getByRole('heading', { name: "Texas Hold'em" }),
    ).toBeInTheDocument();
    expect(await screen.findByText('浏览器 · 加入牌桌')).toBeInTheDocument();
    expect(screen.getByLabelText('IP 直连到房主牌桌')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '创建牌局' })).toBeNull();
  });

  it('uses an IPv4 browser address even without an invitation room parameter', () => {
    expect(browserAddressFromUrl(new URL('http://10.126.126.1:32100/'))).toBe(
      '10.126.126.1:32100',
    );
    expect(browserAddressFromUrl(new URL('http://localhost:5173/'))).toBe('');
  });

  it('shows the nickname confirmation when a browser opens an invitation link', async () => {
    window.history.replaceState(null, '', '/?room=room-at-host');
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () => new Response(JSON.stringify({ roomId: 'room-at-host' })),
      ),
    );

    render(<App />);

    expect(await screen.findByText('牌桌连接正常')).toBeInTheDocument();
    expect(screen.getByLabelText('玩家昵称')).toBeInTheDocument();
  });

  it('restores a stored player from the browser home instead of submitting a new join', async () => {
    browserReconnectSessionStore().save({
      protocolVersion: PROTOCOL_VERSION,
      roomId: 'room-in-progress',
      playerId: 'bob',
      token: 'bob-reconnect-token-123456',
      joinUrl: 'http://host.test/?room=room-in-progress',
    });
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/api/rooms/current')) {
        return new Response(JSON.stringify({ roomId: 'room-in-progress' }));
      }
      return new Response(
        JSON.stringify({
          protocolVersion: PROTOCOL_VERSION,
          roomId: 'room-in-progress',
          playerId: 'bob',
          token: 'bob-reconnect-token-123456',
          joinUrl: 'http://host.test/?room=room-in-progress',
          socketPath: '/socket.io',
        }),
      );
    });
    vi.stubGlobal('fetch', fetcher);

    render(<App />);

    expect(
      await screen.findByText('已恢复对局：room-in-progress'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('玩家昵称')).not.toBeInTheDocument();
    expect(fetcher.mock.calls.map(([input]) => String(input))).toEqual([
      `${window.location.origin}/api/rooms/current`,
      `${window.location.origin}/api/rooms/room-in-progress/resume`,
    ]);
  });

  it('clears the room identity and URL when the live player is removed', async () => {
    const roomId = 'room-removed-live';
    window.history.replaceState(null, '', `/?room=${roomId}`);
    browserReconnectSessionStore().save({
      protocolVersion: PROTOCOL_VERSION,
      roomId,
      playerId: 'bob',
      token: 'bob-reconnect-token-123456',
      joinUrl: `http://host.test/?room=${roomId}`,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).endsWith('/api/rooms/current')
          ? new Response(JSON.stringify({ roomId }))
          : new Response(
              JSON.stringify({
                protocolVersion: PROTOCOL_VERSION,
                roomId,
                playerId: 'bob',
                token: 'bob-reconnect-token-123456',
                joinUrl: `http://host.test/?room=${roomId}`,
                socketPath: '/socket.io',
              }),
            ),
      ),
    );
    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: '模拟被移出' }));

    expect(
      await screen.findByText('你已被房主移出房间，无法重新加入本场对局。'),
    ).toBeInTheDocument();
    expect(browserReconnectSessionStore().load(roomId)).toBeNull();
    expect(new URL(window.location.href).searchParams.get('room')).toBeNull();
  });

  it('shows the permanent removal reason instead of an authentication error', async () => {
    const roomId = 'room-removed-offline';
    window.history.replaceState(null, '', `/?room=${roomId}`);
    browserReconnectSessionStore().save({
      protocolVersion: PROTOCOL_VERSION,
      roomId,
      playerId: 'bob',
      token: 'bob-reconnect-token-123456',
      joinUrl: `http://host.test/?room=${roomId}`,
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).endsWith('/api/rooms/current')
          ? new Response(JSON.stringify({ roomId }))
          : new Response(
              JSON.stringify({
                error: {
                  code: 'PLAYER_REMOVED',
                  message: '你已被房主移出房间，无法重新加入本场对局。',
                },
              }),
              { status: 403, headers: { 'content-type': 'application/json' } },
            ),
      ),
    );

    render(<App />);

    expect(
      await screen.findByText('你已被房主移出房间，无法重新加入本场对局。'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('玩家昵称')).not.toBeInTheDocument();
    expect(browserReconnectSessionStore().load(roomId)).toBeNull();
    expect(new URL(window.location.href).searchParams.get('room')).toBeNull();
  });

  it('opens desktop record management at startup and recovers the selected room', async () => {
    const openRoomRecordManager = vi.fn(async () => undefined);
    const recoverRoomRecord = vi.fn(async () => ({
      protocolVersion: PROTOCOL_VERSION,
      roomId: 'running-room',
      playerId: 'host',
      token: 'host-recovery-token-123456',
      joinUrl: 'http://10.126.126.1:32100/?room=running-room',
      socketPath: '/socket.io',
    }));
    window.texasHoldemDesktop = desktopRuntime({
      openRoomRecordManager,
      listRoomRecords: async () => [
        {
          roomId: 'running-room',
          roomName: '周末牌局',
          hostNickname: 'Alice',
          status: 'running',
          createdAt: '2026-08-03T10:00:00.000Z',
          lastActiveAt: '2026-08-03T11:00:00.000Z',
          completedHands: 7,
          playerCount: 3,
          network: { name: 'Virtual LAN', address: '10.126.126.1' },
        },
      ],
      recoverRoomRecord,
    });

    render(<App />);

    expect(
      await screen.findByRole('heading', { name: '管理对局记录' }),
    ).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: '恢复对局' }));

    await waitFor(() =>
      expect(recoverRoomRecord).toHaveBeenCalledWith({
        roomId: 'running-room',
      }),
    );
    expect(openRoomRecordManager).toHaveBeenCalledOnce();
    expect(
      await screen.findByText('已恢复对局：running-room'),
    ).toBeInTheDocument();
  });

  it('shows a record loading error when desktop record lookup fails', async () => {
    window.texasHoldemDesktop = desktopRuntime({
      listRoomRecords: async () => {
        throw new Error('Management failed');
      },
    });

    render(<App />);

    expect(
      await screen.findByRole('heading', { name: '管理对局记录' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Management failed',
    );
  });

  it('wires the homepage running-room card to the active host recovery action', async () => {
    const recoverRoomRecord = vi.fn(async () => ({
      protocolVersion: PROTOCOL_VERSION,
      roomId: 'running-room',
      playerId: 'host',
      token: 'host-recovery-token-123456',
      joinUrl: 'http://10.126.126.1:32100/?room=running-room',
      socketPath: '/socket.io' as const,
    }));
    window.texasHoldemDesktop = desktopRuntime({
      listRoomRecords: async () => [
        {
          roomId: 'running-room',
          roomName: '周末牌局',
          hostNickname: 'Alice',
          status: 'running',
          createdAt: '2026-08-03T10:00:00.000Z',
          lastActiveAt: '2026-08-03T11:00:00.000Z',
          completedHands: 7,
          playerCount: 3,
          network: { name: 'Virtual LAN', address: '10.126.126.1' },
        },
      ],
      recoverRoomRecord,
    });

    render(<App />);

    fireEvent.click(await screen.findByRole('button', { name: '返回首页' }));
    expect(
      await screen.findByRole('heading', { name: '继续“周末牌局”' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '恢复对局' }));

    await waitFor(() =>
      expect(recoverRoomRecord).toHaveBeenCalledWith({
        roomId: 'running-room',
      }),
    );
    expect(
      await screen.findByText('已恢复对局：running-room'),
    ).toBeInTheDocument();
  });
});
