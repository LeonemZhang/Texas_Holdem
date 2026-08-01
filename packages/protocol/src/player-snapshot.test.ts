import { describe, expect, it } from 'vitest';

import { PlayerSnapshotSchema } from './player-snapshot.js';
import { PROTOCOL_VERSION } from './system.js';

const snapshot = {
  protocolVersion: PROTOCOL_VERSION,
  roomId: 'room-1',
  playerId: 'p1',
  sequence: 5,
  stateVersion: 7,
  room: {
    roomName: 'Friends',
    phase: 'playing',
    smallBlind: 1,
    bigBlind: 2,
    completedHands: 0,
    players: [
      {
        playerId: 'p1',
        nickname: 'Alice',
        seatIndex: 0,
        chips: 99,
        status: 'active',
        isHost: true,
        lobbyReady: true,
      },
      {
        playerId: 'p2',
        nickname: 'Bob',
        seatIndex: 1,
        chips: 98,
        status: 'active',
        isHost: false,
        lobbyReady: true,
      },
    ],
  },
  game: {
    handId: 'h1',
    street: 'preflop',
    buttonPlayerId: 'p1',
    smallBlindPlayerId: 'p1',
    bigBlindPlayerId: 'p2',
    currentActorId: 'p1',
    communityCards: [],
    pots: [{ amount: 3, eligiblePlayerIds: ['p1', 'p2'] }],
    ownHoleCards: ['As', 'Kd'],
    legalActions: {
      canFold: true,
      canCheck: false,
      callAmount: 1,
      minimumRaiseTo: 4,
      maximumRaiseTo: 100,
      canAllIn: true,
    },
  },
  handReady: null,
  statistics: {
    players: [
      {
        playerId: 'p1',
        currentChips: 99,
        participatedHands: 0,
        wonHands: 0,
        showdownWinRate: null,
      },
    ],
    titles: [],
  },
};

describe('PlayerSnapshotSchema', () => {
  it('parses public state, own private cards, and server legal actions', () => {
    expect(PlayerSnapshotSchema.parse(snapshot)).toMatchObject({
      playerId: 'p1',
      game: { ownHoleCards: ['As', 'Kd'], legalActions: { callAmount: 1 } },
    });
  });

  it('has no full-deck or opponent-hole-card output field even for a host', () => {
    const parsed = PlayerSnapshotSchema.parse({
      ...snapshot,
      deck: ['As'],
      opponentHoleCards: { p2: ['Qc', 'Qd'] },
    });
    const serialized = JSON.stringify(parsed);
    expect(serialized).not.toContain('deck');
    expect(serialized).not.toContain('opponentHoleCards');
    expect(serialized).not.toContain('Qc');
  });

  it('rejects an invalid legal-action amount', () => {
    expect(
      PlayerSnapshotSchema.safeParse({
        ...snapshot,
        game: {
          ...snapshot.game,
          legalActions: { ...snapshot.game.legalActions, minimumRaiseTo: -1 },
        },
      }).success,
    ).toBe(false);
  });
});
