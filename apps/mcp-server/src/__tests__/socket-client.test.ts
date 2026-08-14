import { afterEach, describe, expect, it, vi } from 'vitest';

import { resumeRoom } from '../socket-client.js';

const hostUrl = 'http://127.0.0.1:32100';
const sessionResponse = {
  protocolVersion: '3',
  roomId: 'room-1',
  playerId: 'player-1',
  token: 'token-1234567890123456',
  joinUrl: `${hostUrl}/?room=room-1`,
  socketPath: '/socket.io',
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('resumeRoom', () => {
  it('sends the supplied playerId in the resume request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sessionResponse));
    vi.stubGlobal('fetch', fetchMock);

    const result = await resumeRoom(
      hostUrl,
      'room-1',
      'player-1',
      'token-1234567890123456',
      'AI',
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];
    expect(url).toBe(`${hostUrl}/api/rooms/room-1/resume`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      playerId: 'player-1',
      token: 'token-1234567890123456',
      nickname: 'AI',
    });
    expect(result).toEqual({
      roomId: 'room-1',
      playerId: 'player-1',
      sessionToken: 'token-1234567890123456',
    });
  });

  it('omits nickname when the caller only wants to restore the session', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(sessionResponse));
    vi.stubGlobal('fetch', fetchMock);

    await resumeRoom(hostUrl, 'room-1', 'player-1', 'token-1234567890123456');

    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit | undefined,
    ];
    expect(url).toBe(`${hostUrl}/api/rooms/room-1/resume`);
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      playerId: 'player-1',
      token: 'token-1234567890123456',
    });
  });

  it('rejects a resume response that does not match the session schema', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          ...sessionResponse,
          playerId: '',
        }),
      ),
    );

    await expect(
      resumeRoom(hostUrl, 'room-1', 'player-1', 'token-1234567890123456', 'AI'),
    ).rejects.toThrow();
  });
});
