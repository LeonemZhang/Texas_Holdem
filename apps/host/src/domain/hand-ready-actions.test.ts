import { describe, expect, it } from 'vitest';

import {
  addPlayerToHandReady,
  canBeginNextHand,
  clearChipResetVote,
  failChipResetVote,
  normalizeHandReadyAtDeadline,
  removePlayerFromHandReady,
  resetHandReadyAfterChipReset,
  startChipResetVote,
  setChipResetVote,
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
    expect(canBeginNextHand(state, 0)).toBe(false);
    state = setChipResetVote(room, state, 'host', 'reject');
    state = clearChipResetVote(state);
    expect(canBeginNextHand(state, 0)).toBe(true);
    expect(canBeginNextHand(state, 1)).toBe(false);
  });

  it('resets readiness after every voter approves the chip reset', () => {
    const { room, handReady } = phase();
    let state = setChipResetVote(room, handReady, 'host', 'approve');
    expect(canBeginNextHand(state, 0)).toBe(false);
    state = setChipResetVote(room, state, 'bob', 'approve');
    const reset = resetHandReadyAfterChipReset(state);
    expect(reset.chipResetVote).toBeNull();
    expect(reset.players).toEqual([
      { playerId: 'host', choice: 'pending' },
      { playerId: 'bob', choice: 'pending' },
    ]);
  });

  it('clears a rejected chip reset vote and leaves ordinary readiness intact', () => {
    const { room, handReady } = phase();
    const state = setChipResetVote(room, handReady, 'bob', 'reject');
    expect(clearChipResetVote(state).chipResetVote).toBeNull();
  });

  it('retains a failed reset vote without blocking ordinary readiness', () => {
    const { room, handReady } = phase();
    let ready = setHandReadyChoice(room, handReady, 'host', 'ready');
    ready = setHandReadyChoice(room, ready, 'bob', 'sitting-out');
    const voted = setChipResetVote(room, ready, 'bob', 'reject');
    const failed = failChipResetVote(voted, 40_000);

    expect(failed.chipResetVote).toMatchObject({ status: 'failed' });
    expect(failed.startedAtMs).toBe(40_000);
    expect(canBeginNextHand(failed, 0)).toBe(true);
    expect(startChipResetVote(room, failed).chipResetVote).toMatchObject({
      players: [
        { playerId: 'host', vote: 'pending' },
        { playerId: 'bob', vote: 'pending' },
      ],
    });
  });

  it('allows the Host to start a reset vote for every current player', () => {
    let room = createRoom({
      roomId: 'manual-room',
      hostPlayerId: 'host',
      hostNickname: 'Alice',
      settings: {
        roomName: 'Manual vote',
        maxPlayers: 4,
        initialChips: 100,
        blind: { kind: 'preset', smallBlind: 1 },
        actionTimeoutSeconds: 30,
        handReadyTimeoutSeconds: 30,
        blindGrowth: { enabled: false, intervalHands: 10, multiplier: 2 },
        zeroChipPolicy: 'request-chips',
      },
    });
    room = joinRoom(room, { playerId: 'bob', nickname: 'Bob' });
    const playing = Object.freeze({
      ...room,
      phase: 'playing' as const,
      firstHandStarted: true,
    });
    const { room: handReadyRoom, handReady } = beginHandReadyPhase(
      playing,
      'hand-1',
      1_000,
    );

    const started = startChipResetVote(handReadyRoom, handReady);
    expect(started.chipResetVote).toEqual({
      initialChips: 100,
      insufficientPlayerIds: [],
      players: [
        { playerId: 'host', vote: 'pending' },
        { playerId: 'bob', vote: 'pending' },
      ],
    });

    const eliminateRoom = Object.freeze({
      ...handReadyRoom,
      settings: Object.freeze({
        ...handReadyRoom.settings,
        zeroChipPolicy: 'eliminate' as const,
      }),
    });
    expect(() => startChipResetVote(eliminateRoom, handReady)).toThrow(
      'Chip reset vote is disabled by the room policy',
    );
  });

  it('requires at least the current big blind to become ready', () => {
    const { room, handReady } = phase();
    expect(() =>
      setHandReadyChoice(room, handReady, 'bob', 'ready', 4),
    ).toThrow('A player needs at least the big blind to become ready');

    const atBigBlind = Object.freeze({
      ...room,
      players: Object.freeze(
        room.players.map((player) =>
          player.playerId === 'bob'
            ? Object.freeze({ ...player, chips: 4 })
            : player,
        ),
      ),
    });
    expect(
      setHandReadyChoice(atBigBlind, handReady, 'bob', 'ready', 4).players.find(
        ({ playerId }) => playerId === 'bob',
      )?.choice,
    ).toBe('ready');
  });

  it('keeps the chip reset vote active after the readiness deadline', () => {
    const { room, handReady } = phase();
    const normalized = normalizeHandReadyAtDeadline(room, handReady, 31_000);
    expect(normalized.chipResetVote).toEqual(handReady.chipResetVote);
    expect(normalized.players).toEqual(handReady.players);
  });

  it('normalizes ordinary readiness choices to sitting-out at the deadline', () => {
    const { room, handReady } = phase();
    const normalized = normalizeHandReadyAtDeadline(
      room,
      clearChipResetVote(handReady),
      31_000,
    );
    expect(normalized.players).toEqual([
      { playerId: 'host', choice: 'sitting-out' },
      { playerId: 'bob', choice: 'sitting-out' },
    ]);
  });

  it('restarts the readiness window when the vote reaches a terminal result', () => {
    const { room, handReady } = phase();
    let state = setChipResetVote(room, handReady, 'host', 'approve');
    state = setChipResetVote(room, state, 'bob', 'approve');
    const reset = resetHandReadyAfterChipReset(state, 40_000);
    expect(reset.startedAtMs).toBe(40_000);
    expect(reset.deadlineMs).toBe(70_000);

    const rejected = clearChipResetVote(state, 40_000);
    expect(rejected.startedAtMs).toBe(40_000);
    expect(rejected.deadlineMs).toBe(70_000);
  });

  it('closes an obsolete vote when the only depleted player leaves', () => {
    const { handReady } = phase();
    expect(
      removePlayerFromHandReady(handReady, 'bob').chipResetVote,
    ).toBeNull();
  });

  it('adds a late joiner to the active readiness context as pending', () => {
    const { handReady } = phase();
    expect(addPlayerToHandReady(handReady, 'carol').players).toContainEqual({
      playerId: 'carol',
      choice: 'pending',
    });
  });
});
