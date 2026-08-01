import { describe, expect, it } from 'vitest';

import { PROTOCOL_VERSION } from '@texas-holdem/protocol';

import { GameRuntime } from './game-runtime.js';

const settings = {
  roomName: 'Friends',
  maxPlayers: 10,
  initialChips: 100,
  smallBlind: 1,
  actionTimeoutSeconds: 30,
  handReadyTimeoutSeconds: 30,
  blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
  zeroChipPolicy: 'request-chips' as const,
};

describe('GameRuntime', () => {
  it('creates authenticated host and guest sessions and projects command updates', () => {
    const runtime = new GameRuntime();
    const host = runtime.create(
      { hostNickname: 'Alice', settings },
      'http://10.126.126.1:32100',
    );
    const guest = runtime.join(
      host.roomId,
      { nickname: 'Bob' },
      'http://10.126.126.1:32100',
    );

    expect(host.joinUrl).toContain(`room=${host.roomId}`);
    expect(
      runtime.sessions.authenticate({
        protocolVersion: PROTOCOL_VERSION,
        roomId: guest.roomId,
        playerId: guest.playerId,
        token: guest.token,
      }),
    ).toEqual({ roomId: guest.roomId, playerId: guest.playerId });
    expect(
      runtime.snapshot(host.roomId, host.playerId)?.room.players,
    ).toHaveLength(2);

    const before = runtime.snapshot(host.roomId, guest.playerId)!;
    const ready = runtime.dispatch({
      protocolVersion: PROTOCOL_VERSION,
      commandId: 'ready-1',
      roomId: guest.roomId,
      playerId: guest.playerId,
      expectedVersion: before.stateVersion,
      type: 'room.set-lobby-ready',
      ready: true,
    });
    expect(ready.status).toBe('accepted');
    expect(
      runtime
        .snapshot(host.roomId, host.playerId)
        ?.room.players.find(({ playerId }) => playerId === guest.playerId),
    ).toMatchObject({ lobbyReady: true });
  });
});
