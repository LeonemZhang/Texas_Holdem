import { describe, expect, it } from 'vitest';

import { joinRoom, suggestAvailableNickname } from './join-room.js';
import { createRoom } from './room.js';

function room(maxPlayers = 3) {
  return createRoom({
    roomId: 'room',
    hostPlayerId: 'host',
    hostNickname: 'Alice',
    settings: {
      roomName: 'Friends',
      maxPlayers,
      initialChips: 2_000,
      blind: { kind: 'preset', smallBlind: 1 },
      actionTimeoutSeconds: 30,
      handReadyTimeoutSeconds: 30,
      blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
      zeroChipPolicy: 'request-chips',
    },
  });
}

function serviceOnlyRoom(maxPlayers = 3) {
  return createRoom({
    roomId: 'room',
    hostId: 'host-manager',
    hostParticipation: 'service-only',
    hostNickname: 'Alice',
    settings: {
      roomName: 'Friends',
      maxPlayers,
      initialChips: 2_000,
      blind: { kind: 'preset', smallBlind: 1 },
      actionTimeoutSeconds: 30,
      handReadyTimeoutSeconds: 30,
      blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
      zeroChipPolicy: 'request-chips',
    },
  });
}

describe('joinRoom', () => {
  it('assigns the first free seat and initial chips', () => {
    const joined = joinRoom(room(), { playerId: 'bob', nickname: 'Bob' });
    expect(joined.players[1]).toMatchObject({
      playerId: 'bob',
      seatIndex: 1,
      chips: 2_000,
      roles: ['player'],
    });
  });

  it('rejects duplicate nicknames case-insensitively and a full room', () => {
    expect(() =>
      joinRoom(room(), { playerId: 'other', nickname: ' alice ' }),
    ).toThrow('Nickname already exists: alice');
    const full = joinRoom(room(2), { playerId: 'bob', nickname: 'Bob' });
    expect(() =>
      joinRoom(full, { playerId: 'carol', nickname: 'Carol' }),
    ).toThrow('Room is full');
  });

  it('suggests the next available recommended nickname', () => {
    let current = room(4);
    current = joinRoom(current, { playerId: 'bob', nickname: 'Bob' });
    current = joinRoom(current, { playerId: 'carol', nickname: 'Carol' });
    current = joinRoom(current, { playerId: 'player', nickname: 'Player' });

    expect(suggestAvailableNickname(current, 'Alice')).toBe('Dave');
    expect(suggestAvailableNickname(current, 'Bob')).toBe('Dave');
    expect(suggestAvailableNickname(current, 'Player')).toBe('Dave');
  });

  it('lets new participants join an active room while keeping them waiting', () => {
    const started = Object.freeze({
      ...room(),
      phase: 'playing' as const,
      firstHandStarted: true,
    });
    expect(
      joinRoom(started, { playerId: 'bob', nickname: 'Bob' }).players,
    ).toContainEqual(
      expect.objectContaining({
        playerId: 'bob',
        status: 'waiting',
        chips: 2_000,
      }),
    );
  });

  it('rejects joins after the room is closed', () => {
    const closed = Object.freeze({
      ...room(),
      phase: 'closed' as const,
      firstHandStarted: true,
    });
    expect(() =>
      joinRoom(closed, { playerId: 'bob', nickname: 'Bob' }),
    ).toThrow('New players cannot join in the current room phase');
  });

  it('supports the documented maximum of ten players', () => {
    let current = room(10);
    for (let index = 1; index < 10; index += 1) {
      current = joinRoom(current, {
        playerId: `p${index}`,
        nickname: `Player ${index}`,
      });
    }
    expect(current.players).toHaveLength(10);
  });

  it('does not count a service-only host toward capacity or seat allocation', () => {
    let current = serviceOnlyRoom(2);
    current = joinRoom(current, { playerId: 'bob', nickname: 'Bob' });
    expect(current.players[0]).toMatchObject({
      playerId: 'bob',
      seatIndex: 0,
      chips: 2_000,
    });
    current = joinRoom(current, { playerId: 'carol', nickname: 'Carol' });
    expect(current.players.map(({ seatIndex }) => seatIndex)).toEqual([0, 1]);
    expect(() =>
      joinRoom(current, { playerId: 'dave', nickname: 'Dave' }),
    ).toThrow('Room is full');
  });

  it('does not let a player reuse the host identity', () => {
    expect(() =>
      joinRoom(serviceOnlyRoom(), {
        playerId: 'host-manager',
        nickname: 'Bob',
      }),
    ).toThrow('Player id conflicts with host id');
  });
});
