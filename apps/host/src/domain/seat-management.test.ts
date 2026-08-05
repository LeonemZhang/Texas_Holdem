import { describe, expect, it } from 'vitest';

import { joinRoom } from './join-room.js';
import { createRoom, freezeRoom } from './room.js';
import { reseatPlayer, shuffleLobbySeats } from './seat-management.js';

function room() {
  let state = createRoom({
    roomId: 'room-1',
    hostPlayerId: 'host',
    hostNickname: 'Alice',
    settings: {
      roomName: 'Friends',
      maxPlayers: 3,
      initialChips: 100,
      blind: { kind: 'preset', smallBlind: 1 },
      actionTimeoutSeconds: 30,
      handReadyTimeoutSeconds: 30,
      blindGrowth: { enabled: false, intervalHands: 10, multiplier: 2 },
      zeroChipPolicy: 'request-chips',
    },
  });
  state = joinRoom(state, { playerId: 'bob', nickname: 'Bob' });
  return joinRoom(state, { playerId: 'carol', nickname: 'Carol' });
}

describe('lobby seat management', () => {
  it('rejects moves to an empty seat so lobby seats stay compact', () => {
    const before = room();
    expect(() => reseatPlayer(before, 'host', 'bob', 3)).toThrow(
      'Lobby seats must remain compact',
    );
    expect(before.players.map(({ seatIndex }) => seatIndex)).toEqual([0, 1, 2]);
  });

  it('atomically swaps an occupied seat', () => {
    const after = reseatPlayer(room(), 'host', 'host', 2);
    expect(
      after.players.map(({ playerId, seatIndex }) => ({ playerId, seatIndex })),
    ).toEqual([
      { playerId: 'host', seatIndex: 2 },
      { playerId: 'bob', seatIndex: 1 },
      { playerId: 'carol', seatIndex: 0 },
    ]);
  });

  it('randomizes into compact seats and never returns the same multi-player order', () => {
    const spread = freezeRoom({
      ...room(),
      players: room().players.map((player) =>
        player.playerId === 'carol' ? { ...player, seatIndex: 9 } : player,
      ),
    });
    const shuffled = shuffleLobbySeats(spread, 'host', { next: () => 0.999 });
    const seated = [...shuffled.players]
      .sort((left, right) => left.seatIndex - right.seatIndex)
      .map(({ playerId, seatIndex }) => ({ playerId, seatIndex }));
    expect(seated.map(({ seatIndex }) => seatIndex)).toEqual([0, 1, 2]);
    expect(seated.map(({ playerId }) => playerId)).not.toEqual([
      'host',
      'bob',
      'carol',
    ]);
  });

  it('compacts a single player to seat one and rejects unauthorized phases', () => {
    const single = freezeRoom({
      ...room(),
      players: [{ ...room().players[0]!, seatIndex: 8 }],
    });
    expect(
      shuffleLobbySeats(single, 'host', { next: () => 0.5 }).players[0]
        ?.seatIndex,
    ).toBe(0);
    expect(() => reseatPlayer(room(), 'bob', 'host', 3)).toThrow(
      'Only the host',
    );
    expect(() =>
      shuffleLobbySeats(
        freezeRoom({ ...room(), phase: 'playing', firstHandStarted: true }),
        'host',
        { next: () => 0.5 },
      ),
    ).toThrow('Only the host');
  });
});
