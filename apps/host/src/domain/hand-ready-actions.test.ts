import { describe, expect, it } from 'vitest';

import {
  canBeginNextHand,
  normalizeHandReadyAtDeadline,
  setHandReadyChoice,
} from './hand-ready-actions.js';
import { beginHandReadyPhase } from './hand-ready.js';
import { joinRoom } from './join-room.js';
import { createRoom } from './room.js';

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
  return beginHandReadyPhase(room, 'hand-1', 1_000);
}

describe('hand-ready actions', () => {
  it('finishes early only after every player decides and requests clear', () => {
    const { room, handReady } = phase();
    let state = setHandReadyChoice(room, handReady, 'host', 'ready');
    state = setHandReadyChoice(room, state, 'bob', 'sitting-out');
    expect(canBeginNextHand(state, 0)).toBe(true);
    expect(canBeginNextHand(state, 1)).toBe(false);
  });

  it('rejects ready for a zero-chip player', () => {
    const { room, handReady } = phase();
    expect(() => setHandReadyChoice(room, handReady, 'bob', 'ready')).toThrow(
      'A zero-chip player cannot become ready',
    );
  });

  it('normalizes timeout to ready with chips and sitting-out without chips', () => {
    const { room, handReady } = phase();
    const normalized = normalizeHandReadyAtDeadline(room, handReady, 31_000);
    expect(normalized.players).toEqual([
      { playerId: 'host', choice: 'ready' },
      { playerId: 'bob', choice: 'sitting-out' },
    ]);
  });
});
