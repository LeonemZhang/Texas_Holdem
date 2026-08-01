import { describe, expect, it } from 'vitest';

import { createChipRequest, createChipRequestBook } from './chip-requests.js';
import {
  normalizeHandReadyAtDeadline,
  setHandReadyChoice,
} from './hand-ready-actions.js';
import { beginHandReadyPhase } from './hand-ready.js';
import { joinRoom } from './join-room.js';
import { createRoom } from './room.js';
import { startNextRoomHand } from './start-next-hand.js';

function phase() {
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
  room = joinRoom(room, { playerId: 'carol', nickname: 'Carol' });
  room = Object.freeze({
    ...room,
    phase: 'playing' as const,
    firstHandStarted: true,
    players: Object.freeze(
      room.players.map((player) =>
        Object.freeze({
          ...player,
          chips: player.playerId === 'bob' ? 0 : player.chips,
        }),
      ),
    ),
  });
  return beginHandReadyPhase(room, 'h1', 0);
}

describe('startNextRoomHand', () => {
  it('starts immediately after every choice resolves and no request remains', () => {
    const { room, handReady } = phase();
    const ready = normalizeHandReadyAtDeadline(room, handReady, 30_000);
    const result = startNextRoomHand(
      room,
      ready,
      createChipRequestBook(ready),
      {
        handId: 'h2',
        previousButtonIndex: 0,
        smallBlind: 1,
        randomSource: { next: () => 0 },
      },
    );
    expect(result.hand.players.map(({ playerId }) => playerId)).toEqual([
      'host',
      'carol',
    ]);
    expect(
      result.room.players.find(({ playerId }) => playerId === 'bob')?.status,
    ).toBe('sitting-out');
  });

  it('blocks early dealing while any chip request remains pending', () => {
    const { room, handReady } = phase();
    let ready = setHandReadyChoice(room, handReady, 'host', 'ready');
    ready = setHandReadyChoice(room, ready, 'bob', 'sitting-out');
    ready = setHandReadyChoice(room, ready, 'carol', 'ready');
    const requests = createChipRequest(
      room,
      ready,
      createChipRequestBook(ready),
      {
        requestId: 'r1',
        requesterId: 'bob',
        targetPlayerId: null,
        amount: 10,
      },
    );
    expect(() =>
      startNextRoomHand(room, ready, requests, {
        handId: 'h2',
        previousButtonIndex: 0,
        smallBlind: 1,
        randomSource: { next: () => 0 },
      }),
    ).toThrow('Hand readiness is not complete');
  });
});
