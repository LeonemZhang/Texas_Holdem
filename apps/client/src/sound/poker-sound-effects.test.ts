import { describe, expect, it } from 'vitest';

import { PROTOCOL_VERSION, type PlayerSnapshot } from '@texas-holdem/protocol';

import { pokerSoundCues } from './poker-sound-effects.js';

function snapshot(overrides: Partial<PlayerSnapshot> = {}): PlayerSnapshot {
  return {
    protocolVersion: PROTOCOL_VERSION,
    roomId: 'room-1',
    playerId: 'alice',
    sequence: 1,
    stateVersion: 1,
    room: {
      roomName: '朋友局',
      phase: 'playing',
      initialChips: 100,
      smallBlind: 1,
      bigBlind: 2,
      completedHands: 1,
      players: [],
    },
    game: {
      handId: 'hand-1',
      street: 'preflop',
      buttonPlayerId: 'alice',
      smallBlindPlayerId: 'alice',
      bigBlindPlayerId: 'bob',
      currentActorId: 'alice',
      actionDeadlineMs: 30_000,
      communityCards: [],
      totalPot: 0,
      streetPots: [],
      ownHoleCards: null,
      showdownHoleCards: {},
      legalActions: null,
    },
    handReady: null,
    chipRequests: [],
    chipActivity: [],
    statistics: {
      players: [
        {
          playerId: 'alice',
          currentChips: 100,
          netWinLoss: 0,
          participatedHands: 1,
          wonHands: 0,
          largestSingleHandProfit: 0,
          largestSingleHandLoss: 0,
          showdownCount: 0,
          showdownWinRate: null,
          actions: { fold: 0, check: 0, call: 0, raiseTo: 0, allIn: 0 },
        },
      ],
      titles: [],
    },
    ...overrides,
  };
}

describe('poker sound effects', () => {
  it('does not replay sounds for the initial or an older snapshot', () => {
    const first = snapshot();
    expect(pokerSoundCues(null, first)).toEqual([]);
    expect(pokerSoundCues(first, { ...first, sequence: 1 })).toEqual([]);
  });

  it('uses separate turn cues for the local and another player', () => {
    const previous = snapshot();
    expect(
      pokerSoundCues(previous, {
        ...previous,
        sequence: 2,
        game: { ...previous.game!, currentActorId: 'bob' },
      }),
    ).toEqual(['turn-other']);
    expect(
      pokerSoundCues(
        { ...previous, game: { ...previous.game!, currentActorId: 'bob' } },
        {
          ...previous,
          sequence: 3,
          game: { ...previous.game!, currentActorId: 'alice' },
        },
      ),
    ).toEqual(['turn-self']);
  });

  it('plays a dealing cue for a new hand and a ready cue for the preparation phase', () => {
    const previous = snapshot();
    expect(
      pokerSoundCues(previous, {
        ...previous,
        sequence: 2,
        game: { ...previous.game!, handId: 'hand-2', currentActorId: 'bob' },
      }),
    ).toEqual(['deal', 'turn-other']);
    expect(
      pokerSoundCues(previous, {
        ...previous,
        sequence: 2,
        game: null,
        handReady: {
          deadlineMs: 30_000,
          ownChoice: 'pending',
          pendingRequests: [],
        },
      }),
    ).toEqual(['ready']);
  });

  it.each([
    ['fold', 'fold'],
    ['check', 'check'],
    ['call', 'call'],
    ['raiseTo', 'raise'],
    ['allIn', 'all-in'],
  ] as const)('maps a confirmed %s action to its sound', (statistic, sound) => {
    const previous = snapshot();
    const next = snapshot({
      sequence: 2,
      statistics: {
        ...previous.statistics,
        players: previous.statistics.players.map((player) => ({
          ...player,
          actions: { ...player.actions, [statistic]: 1 },
        })),
      },
    });

    expect(pokerSoundCues(previous, next)).toEqual([sound]);
  });
});
