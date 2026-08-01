import { describe, expect, it } from 'vitest';

import { joinRoom } from './join-room.js';
import {
  createReconnectRegistry,
  markPlayerDisconnected,
  reconnectPlayer,
} from './reconnect.js';
import { createRoom } from './room.js';

function context() {
  let room = createRoom({
    roomId: 'room',
    hostPlayerId: 'host',
    hostNickname: 'Alice',
    settings: {
      roomName: 'Friends',
      maxPlayers: 10,
      initialChips: 100,
      blind: { kind: 'preset', smallBlind: 1 },
      actionTimeoutSeconds: 30,
      handReadyTimeoutSeconds: 30,
      blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
      zeroChipPolicy: 'request-chips',
    },
  });
  room = joinRoom(room, { playerId: 'bob', nickname: 'Bob' });
  room = Object.freeze({
    ...room,
    phase: 'playing' as const,
    firstHandStarted: true,
    players: Object.freeze(
      room.players.map((player) =>
        Object.freeze({ ...player, status: 'active' as const }),
      ),
    ),
  });
  const registry = createReconnectRegistry(room, {
    host: 'host-secret-token',
    bob: 'bob-secret-token',
  });
  return { room, registry };
}

describe('reconnection identity', () => {
  it('disconnects without deleting chips, seat, or player history', () => {
    const { room, registry } = context();
    const disconnected = markPlayerDisconnected(room, registry, 'bob');
    expect(disconnected.room.players[1]).toMatchObject({
      playerId: 'bob',
      seatIndex: 1,
      chips: 100,
      status: 'disconnected',
    });
    expect(disconnected.room.players).toHaveLength(2);
  });

  it('restores the original player and active status using only the token', () => {
    const { room, registry } = context();
    const disconnected = markPlayerDisconnected(room, registry, 'bob');
    const restored = reconnectPlayer(
      disconnected.room,
      disconnected.registry,
      'bob-secret-token',
    );
    expect(restored.players[1]).toMatchObject({
      playerId: 'bob',
      status: 'active',
    });
  });

  it('does not accept a nickname as a replacement for the reconnect token', () => {
    const { room, registry } = context();
    const disconnected = markPlayerDisconnected(room, registry, 'bob');
    expect(() =>
      reconnectPlayer(disconnected.room, disconnected.registry, 'Bob'),
    ).toThrow('Invalid reconnect token');
  });
});
