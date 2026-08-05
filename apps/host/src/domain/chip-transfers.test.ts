import { describe, expect, it } from 'vitest';

import { createChipRequest, createChipRequestBook } from './chip-requests.js';
import { approveChipRequest, giveChips } from './chip-transfers.js';
import { beginHandReadyPhase } from './hand-ready.js';
import { joinRoom } from './join-room.js';
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
  room = joinRoom(room, { playerId: 'carol', nickname: 'Carol' });
  room = Object.freeze({
    ...room,
    phase: 'playing' as const,
    firstHandStarted: true,
  });
  const phase = beginHandReadyPhase(room, 'h1', 0);
  return { room: phase.room, handReady: phase.handReady };
}

describe('chip transfers', () => {
  it('performs a direct atomic transfer and conserves total chips', () => {
    const { room, handReady } = context();
    const result = giveChips(room, createChipRequestBook(handReady), {
      transferId: 't1',
      giverPlayerId: 'host',
      receiverPlayerId: 'bob',
      amount: 30,
    });
    expect(result.room.players.map(({ chips }) => chips)).toEqual([
      70, 130, 100,
    ]);
    expect(
      result.room.players.reduce((sum, player) => sum + player.chips, 0),
    ).toBe(300);
  });

  it('fails insufficient transfer without changing either immutable player', () => {
    const { room, handReady } = context();
    const before = room.players.map(({ chips }) => chips);
    expect(() =>
      giveChips(room, createChipRequestBook(handReady), {
        transferId: 't1',
        giverPlayerId: 'host',
        receiverPlayerId: 'bob',
        amount: 101,
      }),
    ).toThrow('Giver has insufficient chips');
    expect(room.players.map(({ chips }) => chips)).toEqual(before);
  });

  it('lets the targeted player complete a request', () => {
    const { room, handReady } = context();
    let requests = createChipRequest(
      room,
      handReady,
      createChipRequestBook(handReady),
      {
        requestId: 'r1',
        requesterId: 'bob',
        targetPlayerId: 'host',
        amount: 20,
      },
    );
    const result = approveChipRequest(room, requests, 'r1', 'host', 't1');
    requests = result.requests;
    expect(requests.requests[0]?.status).toBe('completed');
    expect(result.room.players.map(({ chips }) => chips)).toEqual([
      80, 120, 100,
    ]);
    expect(() =>
      approveChipRequest(result.room, requests, 'r1', 'carol', 't2'),
    ).toThrow('Chip request is not pending: r1');
  });
});
