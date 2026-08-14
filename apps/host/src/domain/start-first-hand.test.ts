import { describe, expect, it } from 'vitest';

import { joinRoom } from './join-room.js';
import { setLobbyReady } from './lobby-ready.js';
import { createRoom } from './room.js';
import { startFirstHand } from './start-first-hand.js';

function readyRoom() {
  let room = createRoom({
    roomId: 'room',
    hostPlayerId: 'host',
    hostNickname: 'Alice',
    settings: {
      roomName: 'Friends',
      maxPlayers: 10,
      initialChips: 2_000,
      blind: { kind: 'preset', smallBlind: 1 },
      actionTimeoutSeconds: 30,
      handReadyTimeoutSeconds: 30,
      blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
      zeroChipPolicy: 'request-chips',
    },
  });
  room = joinRoom(room, { playerId: 'bob', nickname: 'Bob' });
  room = setLobbyReady(room, 'host', true);
  return setLobbyReady(room, 'bob', true);
}

function readyServiceOnlyRoom() {
  let room = createRoom({
    roomId: 'room',
    hostId: 'host-manager',
    hostParticipation: 'service-only',
    hostNickname: 'Alice',
    settings: {
      roomName: 'Friends',
      maxPlayers: 10,
      initialChips: 2_000,
      blind: { kind: 'preset', smallBlind: 1 },
      actionTimeoutSeconds: 30,
      handReadyTimeoutSeconds: 30,
      blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
      zeroChipPolicy: 'request-chips',
    },
  });
  room = joinRoom(room, { playerId: 'bob', nickname: 'Bob' });
  room = joinRoom(room, { playerId: 'carol', nickname: 'Carol' });
  room = setLobbyReady(room, 'bob', true);
  return setLobbyReady(room, 'carol', true);
}

describe('startFirstHand', () => {
  it('lets only the ready host create the first hand directly', () => {
    const result = startFirstHand(readyRoom(), 'host', 'hand-1', {
      next: () => 0,
    });
    expect(result.room).toMatchObject({
      phase: 'playing',
      firstHandStarted: true,
    });
    expect(result.hand.players).toHaveLength(2);
    expect(result.hand.street).toBe('preflop');
  });

  it('does not insert the later-hand 30-second readiness phase', () => {
    const result = startFirstHand(readyRoom(), 'host', 'hand-1', {
      next: () => 0,
    });
    expect(result.room.phase).not.toBe('hand-ready');
  });

  it('rejects ordinary players and a repeated first-start command', () => {
    expect(() =>
      startFirstHand(readyRoom(), 'bob', 'hand-1', { next: () => 0 }),
    ).toThrow('Only the host can start the first hand');
    const started = startFirstHand(readyRoom(), 'host', 'hand-1', {
      next: () => 0,
    });
    expect(() =>
      startFirstHand(started.room, 'host', 'hand-2', { next: () => 0 }),
    ).toThrow('First hand was already started');
  });

  it('starts a service-only room with actual players only', () => {
    const result = startFirstHand(
      readyServiceOnlyRoom(),
      'host-manager',
      'hand-1',
      { next: () => 0 },
    );

    expect(result.hand.players).toHaveLength(2);
    expect(result.hand.players.map(({ playerId }) => playerId)).toEqual([
      'bob',
      'carol',
    ]);
    expect(
      result.room.players.every(({ playerId }) => playerId !== 'host-manager'),
    ).toBe(true);
  });
});
