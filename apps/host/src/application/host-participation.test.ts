import { describe, expect, it } from 'vitest';

import { PROTOCOL_VERSION } from '@texas-holdem/protocol';

import { GameRuntime } from './game-runtime.js';

const settings = {
  roomName: 'Service table',
  maxPlayers: 4,
  initialChips: 100,
  smallBlind: 1,
  actionTimeoutSeconds: 30,
  handReadyTimeoutSeconds: 30,
  blindGrowth: { enabled: false, intervalHands: 10, multiplier: 2 },
  zeroChipPolicy: 'request-chips' as const,
};

function command(
  runtime: GameRuntime,
  roomId: string,
  playerId: string,
  type: string,
  extra: Record<string, unknown> = {},
) {
  const room = runtime.rooms.get(roomId);
  if (!room) throw new Error('room missing');
  return runtime.dispatch({
    protocolVersion: PROTOCOL_VERSION,
    commandId: `${type}-${Math.random()}`,
    roomId,
    playerId,
    expectedVersion: room.version,
    type,
    ...extra,
  });
}

describe('service-only Host runtime boundary', () => {
  it('creates no Host player and exposes only a public management snapshot', () => {
    const runtime = new GameRuntime();
    const host = runtime.create(
      {
        hostNickname: 'Service Host',
        hostParticipation: 'service-only',
        settings,
      },
      'http://127.0.0.1:32100',
    );
    expect(runtime.rooms.get(host.roomId)?.hostId).toBe(host.playerId);
    expect(runtime.rooms.get(host.roomId)?.players).toEqual([]);
    expect(host.sessionType).toBe('host');
    expect(host.hostId).toBe(host.playerId);
    expect(
      runtime.authenticate({
        protocolVersion: PROTOCOL_VERSION,
        roomId: host.roomId,
        playerId: host.playerId,
        hostId: host.hostId!,
        sessionType: 'host',
        token: host.token,
      }),
    ).toMatchObject({ roomId: host.roomId, sessionType: 'host' });
    expect(
      runtime.authenticate({
        protocolVersion: PROTOCOL_VERSION,
        roomId: host.roomId,
        playerId: 'forged-player',
        hostId: host.hostId!,
        sessionType: 'host',
        token: host.token,
      }),
    ).toBeNull();
    expect(
      runtime.resume(
        host.roomId,
        {
          playerId: host.playerId,
          hostId: host.hostId,
          sessionType: 'host',
          token: host.token,
        },
        host.joinUrl,
      ).sessionType,
    ).toBe('host');

    const first = runtime.join(
      host.roomId,
      { nickname: 'Alice' },
      host.joinUrl,
    );
    const second = runtime.join(host.roomId, { nickname: 'Bob' }, host.joinUrl);
    expect(
      runtime.rooms.get(host.roomId)?.players.map(({ playerId }) => playerId),
    ).toEqual([first.playerId, second.playerId]);

    expect(
      command(runtime, host.roomId, first.playerId, 'room.set-lobby-ready', {
        ready: true,
      }).status,
    ).toBe('accepted');
    expect(
      command(runtime, host.roomId, second.playerId, 'room.set-lobby-ready', {
        ready: true,
      }).status,
    ).toBe('accepted');
    expect(runtime.rooms.get(host.roomId)?.hostId).toBe(host.playerId);
    expect(
      command(runtime, host.roomId, first.playerId, 'room.start-first-hand', {
        handId: 'service-hand',
      }).status,
    ).toBe('unauthorized');
    expect(
      command(runtime, host.roomId, host.playerId, 'room.start-first-hand', {
        actorType: 'host',
        handId: 'service-hand',
      }).status,
    ).toBe('accepted');

    const snapshot = runtime.hostSnapshot(host.roomId, host.hostId!);
    expect(snapshot?.room.players).toHaveLength(2);
    expect(snapshot?.game).not.toBeNull();
    expect(snapshot?.game && 'ownHoleCards' in snapshot.game).toBe(false);
    expect(snapshot?.game && 'legalActions' in snapshot.game).toBe(false);
  });
});
