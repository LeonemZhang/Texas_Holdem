import { describe, expect, it, vi } from 'vitest';

import { RoomSessionClient } from './room-session-client.js';

const session = {
  protocolVersion: '1' as const,
  roomId: 'room-1',
  playerId: 'player-1',
  token: 'reconnect-token-123456',
  joinUrl: 'http://10.126.126.1:32100/?room=room-1',
  socketPath: '/socket.io',
};

describe('RoomSessionClient', () => {
  it('invokes an injected fetch port without binding it as a client method', async () => {
    function strictFetch(this: unknown) {
      expect(this).toBeUndefined();
      return Promise.resolve(
        new Response(JSON.stringify({ roomId: 'room-1' }), { status: 200 }),
      );
    }
    const client = new RoomSessionClient(
      'http://10.126.126.1:32100',
      strictFetch,
    );

    await client.currentRoomId();
  });

  it('resolves the current room and creates or joins through the selected host', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ roomId: 'room-1' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(session), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(session), { status: 200 }),
      );
    const client = new RoomSessionClient('http://10.126.126.1:32100', fetcher);

    expect(await client.currentRoomId()).toBe('room-1');
    await client.create({
      hostNickname: 'Alice',
      settings: {
        roomName: 'Friends',
        maxPlayers: 10,
        initialChips: 100,
        smallBlind: 1,
        actionTimeoutSeconds: 30,
        handReadyTimeoutSeconds: 30,
        blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
        zeroChipPolicy: 'request-chips',
      },
    });
    await client.join('room-1', { nickname: 'Bob' });

    expect(fetcher.mock.calls.map(([url]) => String(url))).toEqual([
      'http://10.126.126.1:32100/api/rooms/current',
      'http://10.126.126.1:32100/api/rooms',
      'http://10.126.126.1:32100/api/rooms/room-1/join',
    ]);
  });

  it('surfaces the host error message', async () => {
    const client = new RoomSessionClient(
      'http://10.126.126.1:32100',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify({ error: { message: '房间已开始游戏' } }),
            { status: 409 },
          ),
        ),
    );
    await expect(client.join('room-1', { nickname: 'Bob' })).rejects.toThrow(
      '房间已开始游戏',
    );
  });
});
