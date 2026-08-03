import { describe, expect, it } from 'vitest';

import {
  createChipRequest,
  createChipRequestBook,
  revokePendingChipRequests,
} from '../apps/host/src/domain/chip-requests.js';
import { approveChipRequest } from '../apps/host/src/domain/chip-transfers.js';
import {
  canBeginNextHand,
  normalizeHandReadyAtDeadline,
  setHandReadyChoice,
} from '../apps/host/src/domain/hand-ready-actions.js';
import { beginHandReadyPhase } from '../apps/host/src/domain/hand-ready.js';
import { joinRoom } from '../apps/host/src/domain/join-room.js';
import { createRoom } from '../apps/host/src/domain/room.js';
import { startNextRoomHand } from '../apps/host/src/domain/start-next-hand.js';

function createHandReadyTable() {
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
  return beginHandReadyPhase(room, 'hand-1', 0);
}

describe('E2E04 hand readiness and chip requests', () => {
  it('blocks an early deal until a chip request is approved and everyone is ready', () => {
    const phase = createHandReadyTable();
    let ready = setHandReadyChoice(
      phase.room,
      phase.handReady,
      'host',
      'ready',
    );
    ready = setHandReadyChoice(phase.room, ready, 'carol', 'ready');
    let requests = createChipRequestBook(ready);
    requests = createChipRequest(phase.room, ready, requests, {
      requestId: 'request-1',
      requesterId: 'bob',
      targetPlayerId: 'host',
      amount: 25,
    });

    expect(canBeginNextHand(ready, 1)).toBe(false);
    expect(() =>
      startNextRoomHand(phase.room, ready, requests, {
        handId: 'hand-2',
        previousButtonIndex: 0,
        smallBlind: 1,
        randomSource: { next: () => 0 },
      }),
    ).toThrow('Hand readiness is not complete');

    const approved = approveChipRequest(
      phase.room,
      requests,
      'request-1',
      'host',
      'transfer-1',
    );
    ready = setHandReadyChoice(approved.room, ready, 'bob', 'ready');
    const started = startNextRoomHand(approved.room, ready, approved.requests, {
      handId: 'hand-2',
      previousButtonIndex: 0,
      smallBlind: 1,
      randomSource: { next: () => 0 },
    });

    expect(started.hand.players.map(({ playerId }) => playerId)).toEqual([
      'host',
      'bob',
      'carol',
    ]);
    expect(
      started.room.players.find(({ playerId }) => playerId === 'bob')?.chips,
    ).toBe(25);
  });

  it('revokes unresolved requests at the deadline and seats the zero-chip player out', () => {
    const phase = createHandReadyTable();
    let ready = setHandReadyChoice(
      phase.room,
      phase.handReady,
      'host',
      'ready',
    );
    ready = setHandReadyChoice(phase.room, ready, 'carol', 'ready');
    let requests = createChipRequest(
      phase.room,
      ready,
      createChipRequestBook(ready),
      {
        requestId: 'request-1',
        requesterId: 'bob',
        targetPlayerId: null,
        amount: 25,
      },
    );

    const deadlineReady = normalizeHandReadyAtDeadline(
      phase.room,
      ready,
      30_000,
    );
    expect(canBeginNextHand(deadlineReady, 1)).toBe(false);
    requests = revokePendingChipRequests(requests);
    const started = startNextRoomHand(phase.room, deadlineReady, requests, {
      handId: 'hand-2',
      previousButtonIndex: 0,
      smallBlind: 1,
      randomSource: { next: () => 0 },
    });

    expect(started.hand.players.map(({ playerId }) => playerId)).toEqual([
      'host',
      'carol',
    ]);
    expect(
      started.room.players.find(({ playerId }) => playerId === 'bob')?.status,
    ).toBe('sitting-out');
    expect(requests.requests[0]?.status).toBe('revoked');
  });
});
