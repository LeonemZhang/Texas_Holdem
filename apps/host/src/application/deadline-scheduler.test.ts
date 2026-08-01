import { describe, expect, it, vi } from 'vitest';

import {
  applyHandAction,
  createBettingRound,
  startHand,
} from '@texas-holdem/poker-core';

import { beginHandReadyPhase } from '../domain/hand-ready.js';
import { normalizeHandReadyAtDeadline } from '../domain/hand-ready-actions.js';
import { createRoom, freezeRoom } from '../domain/room.js';
import {
  DeadlineScheduler,
  timedOutBettingAction,
  type Clock,
} from './deadline-scheduler.js';

class VirtualClock implements Clock {
  constructor(public currentMs: number) {}
  nowMs(): number {
    return this.currentMs;
  }
}

function room() {
  const lobby = createRoom({
    roomId: 'room-1',
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
  return freezeRoom({
    ...lobby,
    phase: 'playing',
    firstHandStarted: true,
    players: [
      { ...lobby.players[0]!, status: 'active' },
      {
        playerId: 'bob',
        nickname: 'Bob',
        seatIndex: 1,
        chips: 100,
        roles: ['player'],
        status: 'active',
        lobbyReady: false,
      },
    ],
  });
}

describe('DeadlineScheduler', () => {
  it('drives an action timeout exactly once using check-or-fold policy', () => {
    const clock = new VirtualClock(1_000);
    const scheduler = new DeadlineScheduler(clock);
    let hand = startHand({
      handId: 'hand-1',
      participants: [
        { playerId: 'host', seatIndex: 0, stack: 100 },
        { playerId: 'bob', seatIndex: 1, stack: 100 },
      ],
      previousButtonIndex: null,
      smallBlind: 1,
      randomSource: { next: () => 0.5 },
    });
    const actor = hand.betting.currentActorId!;
    const callback = vi.fn(() => {
      hand = applyHandAction(
        hand,
        actor,
        timedOutBettingAction(hand.betting, actor),
      );
    });
    scheduler.scheduleActionTimeout({
      roomId: 'room-1',
      handId: hand.handId,
      turnId: 'turn-1',
      deadlineMs: 2_000,
      onTimeout: callback,
    });

    clock.currentMs = 1_999;
    expect(scheduler.runDue()).toBe(0);
    clock.currentMs = 2_000;
    expect(scheduler.runDue()).toBe(1);
    expect(scheduler.runDue()).toBe(0);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(
      hand.players.find(({ playerId }) => playerId === actor)?.status,
    ).toBe('folded');
  });

  it('chooses check instead of fold when the timed-out player owes nothing', () => {
    const betting = createBettingRound(
      [
        {
          playerId: 'host',
          stack: 100,
          streetCommitted: 0,
          totalCommitted: 0,
          status: 'active',
        },
        {
          playerId: 'bob',
          stack: 100,
          streetCommitted: 0,
          totalCommitted: 0,
          status: 'active',
        },
      ],
      2,
      'host',
    );
    expect(timedOutBettingAction(betting, 'host')).toEqual({ type: 'check' });
  });

  it('drives hand-ready normalization once after its server deadline', () => {
    const clock = new VirtualClock(1_000);
    const scheduler = new DeadlineScheduler(clock);
    const playing = room();
    const started = beginHandReadyPhase(playing, 'hand-1', clock.nowMs());
    let ready = started.handReady;
    const callback = vi.fn((nowMs: number) => {
      ready = normalizeHandReadyAtDeadline(started.room, ready, nowMs);
    });
    const input = {
      roomId: playing.roomId,
      afterHandId: 'hand-1',
      deadlineMs: ready.deadlineMs,
      onTimeout: callback,
    };
    expect(scheduler.scheduleHandReadyTimeout(input)).toBe(true);
    expect(scheduler.scheduleHandReadyTimeout(input)).toBe(false);
    clock.currentMs = ready.deadlineMs;
    expect(scheduler.runDue()).toBe(1);
    expect(scheduler.runDue()).toBe(0);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(ready.players.every(({ choice }) => choice === 'ready')).toBe(true);
  });
});
