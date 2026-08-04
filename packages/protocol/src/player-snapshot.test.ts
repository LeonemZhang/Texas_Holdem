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
    initialChips: 100,
    smallBlind: 1,
    bigBlind: 2,
    completedHands: 0,
    players: [
      {
        playerId: 'p1',
        nickname: 'Alice',
        seatIndex: 0,
        chips: 99,
        streetCommitted: 1,
        totalCommitted: 1,
        status: 'active',
        isHost: true,
        lobbyReady: true,
      },
      {
        playerId: 'p2',
        nickname: 'Bob',
        seatIndex: 1,
        chips: 98,
        streetCommitted: 2,
        totalCommitted: 2,
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
    actionDeadlineMs: 30_000,
    communityCards: [],
    totalPot: 3,
    streetPots: [{ street: 'preflop', amount: 3 }],
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
  chipRequests: [],
  statistics: {
    players: [
      {
        playerId: 'p1',
        currentChips: 99,
        participatedHands: 0,
        wonHands: 0,
        largestSingleHandProfit: 0,
        largestWonPot: 0,
        showdownCount: 0,
        showdownWinRate: null,
        actions: { fold: 0, check: 0, call: 0, raiseTo: 0, allIn: 0 },
      },
    ],
    titles: [],
  },
};

describe('PlayerSnapshotSchema', () => {
  it('parses public state, own private cards, and server legal actions', () => {
    expect(PlayerSnapshotSchema.parse(snapshot)).toMatchObject({
      playerId: 'p1',
      room: { initialChips: 100 },
      game: {
        ownHoleCards: ['As', 'Kd'],
        totalPot: 3,
        streetPots: [{ street: 'preflop', amount: 3 }],
        showdownHoleCards: {},
        legalActions: { callAmount: 1 },
      },
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

  it('defaults an older snapshot without an action deadline to no countdown', () => {
    const legacyGame = { ...snapshot.game };
    delete (legacyGame as { actionDeadlineMs?: number | null })
      .actionDeadlineMs;

    expect(
      PlayerSnapshotSchema.parse({ ...snapshot, game: legacyGame }).game
        ?.actionDeadlineMs,
    ).toBeNull();
  });

  it('accepts public contender cards only for a completed showdown', () => {
    expect(
      PlayerSnapshotSchema.parse({
        ...snapshot,
        room: { ...snapshot.room, phase: 'hand-ready' },
        game: {
          ...snapshot.game,
          street: 'river',
          showdownHoleCards: { p1: ['As', 'Kd'], p2: ['Qc', 'Qd'] },
        },
      }).game?.showdownHoleCards,
    ).toEqual({ p1: ['As', 'Kd'], p2: ['Qc', 'Qd'] });
  });

  it('defaults missing public contribution values for an older snapshot', () => {
    const legacyPlayers = snapshot.room.players.map((player) => {
      const legacyPlayer = { ...player };
      delete (legacyPlayer as { streetCommitted?: number }).streetCommitted;
      delete (legacyPlayer as { totalCommitted?: number }).totalCommitted;
      return legacyPlayer;
    });

    expect(
      PlayerSnapshotSchema.parse({
        ...snapshot,
        room: { ...snapshot.room, players: legacyPlayers },
      }).room.players,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ streetCommitted: 0, totalCommitted: 0 }),
      ]),
    );
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
