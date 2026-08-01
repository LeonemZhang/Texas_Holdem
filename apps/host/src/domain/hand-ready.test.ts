import { describe, expect, it } from 'vitest';

import { beginHandReadyPhase } from './hand-ready.js';
import { createRoom } from './room.js';

function playingRoom(timeout = 30) {
  return Object.freeze({
    ...createRoom({
      roomId: 'room',
      hostPlayerId: 'host',
      hostNickname: 'Alice',
      settings: {
        roomName: 'Friends',
        maxPlayers: 10,
        initialChips: 2_000,
        blind: { kind: 'preset', smallBlind: 1 },
        actionTimeoutSeconds: 30,
        handReadyTimeoutSeconds: timeout,
        blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
        zeroChipPolicy: 'request-chips',
      },
    }),
    phase: 'playing' as const,
    firstHandStarted: true,
  });
}

describe('beginHandReadyPhase', () => {
  it('creates the default 30-second readiness deadline after settlement', () => {
    const result = beginHandReadyPhase(playingRoom(), 'hand-1', 1_000);
    expect(result.room.phase).toBe('hand-ready');
    expect(result.handReady).toMatchObject({
      afterHandId: 'hand-1',
      startedAtMs: 1_000,
      deadlineMs: 31_000,
    });
    expect(result.handReady.players).toEqual([
      { playerId: 'host', choice: 'pending' },
    ]);
  });

  it('uses a custom room timeout without consulting system time', () => {
    const first = beginHandReadyPhase(playingRoom(45), 'hand-1', 5_000);
    const second = beginHandReadyPhase(playingRoom(45), 'hand-1', 5_000);
    expect(first.handReady).toEqual(second.handReady);
    expect(first.handReady.deadlineMs).toBe(50_000);
  });
});
