import { describe, expect, it } from 'vitest';

import {
  createChipRequest,
  createChipRequestBook,
  rejectChipRequest,
  revokeChipRequest,
} from './chip-requests.js';
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
  const ready = beginHandReadyPhase(room, 'h1', 0);
  return { room: ready.room, handReady: ready.handReady };
}

describe('chip requests', () => {
  it('creates requests for a specific player only during readiness', () => {
    const { room, handReady } = context();
    let book = createChipRequestBook(handReady);
    book = createChipRequest(room, handReady, book, {
      requestId: 'targeted',
      requesterId: 'bob',
      targetPlayerId: 'host',
      amount: 20,
    });
    expect(book.requests).toMatchObject([
      { requestId: 'targeted', targetPlayerId: 'host', status: 'pending' },
    ]);
  });

  it('lets only the requester revoke a pending request', () => {
    const { room, handReady } = context();
    let book = createChipRequest(
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
    expect(() => revokeChipRequest(book, 'r1', 'carol')).toThrow(
      'Only the requester can revoke a chip request',
    );
    book = revokeChipRequest(book, 'r1', 'bob');
    expect(book.requests[0]?.status).toBe('revoked');
  });

  it('rejects a request that exceeds the selected donor balance', () => {
    const { room, handReady } = context();
    const book = createChipRequestBook(handReady);

    expect(() =>
      createChipRequest(room, handReady, book, {
        requestId: 'targeted-too-large',
        requesterId: 'bob',
        targetPlayerId: 'host',
        amount: 101,
      }),
    ).toThrow('Requested chips exceed the target available chips');
  });

  it('records the targeted player rejection immediately', () => {
    const { room, handReady } = context();
    let book = createChipRequest(
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
    expect(() => rejectChipRequest(book, 'r1', 'carol')).toThrow(
      'Only the targeted player',
    );
    book = rejectChipRequest(book, 'r1', 'host');
    expect(book.requests[0]).toMatchObject({
      status: 'rejected',
      rejectedByPlayerIds: ['host'],
    });
  });
});
