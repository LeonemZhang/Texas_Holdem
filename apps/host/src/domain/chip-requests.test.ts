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
  it('creates targeted and whole-table requests only during readiness', () => {
    const { room, handReady } = context();
    let book = createChipRequestBook(handReady);
    book = createChipRequest(room, handReady, book, {
      requestId: 'targeted',
      requesterId: 'bob',
      targetPlayerId: 'host',
      amount: 20,
    });
    book = createChipRequest(room, handReady, book, {
      requestId: 'table',
      requesterId: 'bob',
      targetPlayerId: null,
      amount: 30,
      note: ' one rebuy ',
    });
    expect(book.requests).toMatchObject([
      { requestId: 'targeted', targetPlayerId: 'host', status: 'pending' },
      {
        requestId: 'table',
        targetPlayerId: null,
        note: 'one rebuy',
        status: 'pending',
      },
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

  it('records individual all-table rejections until every donor rejects', () => {
    const { room, handReady } = context();
    let book = createChipRequest(
      room,
      handReady,
      createChipRequestBook(handReady),
      {
        requestId: 'r1',
        requesterId: 'bob',
        targetPlayerId: null,
        amount: 20,
      },
    );
    book = rejectChipRequest(room, book, 'r1', 'host');
    expect(book.requests[0]?.status).toBe('pending');
    book = rejectChipRequest(room, book, 'r1', 'carol');
    expect(book.requests[0]).toMatchObject({
      status: 'rejected',
      rejectedByPlayerIds: ['host', 'carol'],
    });
  });
});
