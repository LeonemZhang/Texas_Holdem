import { describe, expect, it } from 'vitest';

import { joinRoom } from './join-room.js';
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

  it('rejects a new participant after the first hand starts', () => {
    const started = Object.freeze({
      ...room(),
      phase: 'playing' as const,
      firstHandStarted: true,
    });
    expect(() =>
      joinRoom(started, { playerId: 'bob', nickname: 'Bob' }),
    ).toThrow('New players cannot join after the first hand starts');
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
});
