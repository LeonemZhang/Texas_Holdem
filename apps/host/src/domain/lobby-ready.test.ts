import { describe, expect, it } from 'vitest';

import { joinRoom } from './join-room.js';
import { canHostStartFirstHand, setLobbyReady } from './lobby-ready.js';
import { createRoom } from './room.js';

function twoPlayerRoom() {
  const room = createRoom({
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
  return joinRoom(room, { playerId: 'bob', nickname: 'Bob' });
}

function serviceOnlyTwoPlayerRoom() {
  const room = createRoom({
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
  return joinRoom(joinRoom(room, { playerId: 'bob', nickname: 'Bob' }), {
    playerId: 'carol',
    nickname: 'Carol',
  });
}

describe('lobby readiness', () => {
  it('requires at least two seated players and every non-host player ready', () => {
    let room = twoPlayerRoom();
    expect(canHostStartFirstHand(room, 'host')).toBe(false);
    room = setLobbyReady(room, 'bob', true);
    expect(canHostStartFirstHand(room, 'host')).toBe(true);
  });

  it('never starts automatically when everyone becomes ready', () => {
    const room = setLobbyReady(twoPlayerRoom(), 'bob', true);
    expect(room.phase).toBe('lobby');
    expect(room.firstHandStarted).toBe(false);
  });

  it('disables starting immediately when a player cancels readiness', () => {
    let room = setLobbyReady(twoPlayerRoom(), 'bob', true);
    room = setLobbyReady(room, 'bob', false);
    expect(canHostStartFirstHand(room, 'host')).toBe(false);
  });

  it('does not grant the manual start gate to an ordinary player', () => {
    const room = setLobbyReady(twoPlayerRoom(), 'bob', true);
    expect(canHostStartFirstHand(room, 'bob')).toBe(false);
  });

  it('keeps the host ready without a manual readiness action', () => {
    const room = twoPlayerRoom();
    expect(
      room.players.find(({ playerId }) => playerId === 'host')?.lobbyReady,
    ).toBe(true);
    expect(() => setLobbyReady(room, 'host', false)).toThrow(
      'Host remains ready',
    );
  });

  it('counts only actual players for a service-only host', () => {
    let room = serviceOnlyTwoPlayerRoom();
    expect(room.players).toHaveLength(2);
    expect(canHostStartFirstHand(room, 'host-manager')).toBe(false);
    expect(() => setLobbyReady(room, 'host-manager', true)).toThrow(
      'Player is not seated',
    );
    room = setLobbyReady(room, 'bob', true);
    expect(canHostStartFirstHand(room, 'host-manager')).toBe(false);
    room = setLobbyReady(room, 'carol', true);
    expect(canHostStartFirstHand(room, 'host-manager')).toBe(true);
  });
});
