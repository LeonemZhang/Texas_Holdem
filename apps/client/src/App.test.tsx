import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PROTOCOL_VERSION } from '@texas-holdem/protocol';

import { App, forgetBrowserRoomInUrl, rememberBrowserRoomInUrl } from './App';
import { browserReconnectSessionStore } from './connection/reconnect-session-store.js';

describe('application shell', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '/');
    window.localStorage.clear();
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
    expect(await screen.findByText('浏览器玩家')).toBeInTheDocument();
    expect(screen.getByLabelText('房主 IP 或完整地址')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '创建房间' })).toBeNull();
  });
});
