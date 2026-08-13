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
    handNumber: 1,
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
    ownHandType: 'straight',
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
  chipActivity: [],
  statistics: {
    players: [
      {
        playerId: 'p1',
        currentChips: 99,
        netWinLoss: -1,
        participatedHands: 0,
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
};

describe('PlayerSnapshotSchema', () => {
  it('parses public state, own private cards, and server legal actions', () => {
    expect(PlayerSnapshotSchema.parse(snapshot)).toMatchObject({
      playerId: 'p1',
      room: { initialChips: 100 },
      game: {
        ownHoleCards: ['As', 'Kd'],
        ownHandType: 'straight',
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

  it('accepts a permanently removed player in an authoritative snapshot', () => {
    const parsed = PlayerSnapshotSchema.parse({
      ...snapshot,
      room: {
        ...snapshot.room,
        players: snapshot.room.players.map((player) =>
          player.playerId === 'p2' ? { ...player, status: 'removed' } : player,
        ),
      },
    });

    expect(parsed.room.players[1]?.status).toBe('removed');
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

  it('accepts an older snapshot without the optional current hand number', () => {
    const legacyGame = { ...snapshot.game };
    delete (legacyGame as { handNumber?: number }).handNumber;

    expect(
      PlayerSnapshotSchema.parse({ ...snapshot, game: legacyGame }).game,
    ).not.toHaveProperty('handNumber');
  });

  it('rejects a non-positive or unsafe current hand number', () => {
    expect(
      PlayerSnapshotSchema.safeParse({
        ...snapshot,
        game: { ...snapshot.game, handNumber: 0 },
      }).success,
    ).toBe(false);
    expect(
      PlayerSnapshotSchema.safeParse({
        ...snapshot,
        game: { ...snapshot.game, handNumber: Number.MAX_SAFE_INTEGER + 1 },
      }).success,
    ).toBe(false);
  });

  it('requires authoritative chip activity in protocol v3 snapshots', () => {
    const withoutActivity = { ...snapshot } as Partial<typeof snapshot>;
    delete withoutActivity.chipActivity;
    expect(PlayerSnapshotSchema.safeParse(withoutActivity).success).toBe(false);
  });

  it('requires authoritative millisecond timestamps for chip activity', () => {
    const activity = {
      kind: 'request' as const,
      requestId: 'request-1',
      requesterId: 'p2',
      targetPlayerId: 'p1',
      amount: 20,
      status: 'pending' as const,
      rejectedByPlayerIds: [],
      completedByPlayerId: null,
      createdSequence: 6,
      updatedSequence: 6,
      createdAtMs: 1_754_368_496_000,
      updatedAtMs: 1_754_368_496_000,
    };
    expect(
      PlayerSnapshotSchema.safeParse({
        ...snapshot,
        chipActivity: [activity],
      }).success,
    ).toBe(true);
    const withoutUpdatedAt = { ...activity } as Partial<typeof activity>;
    delete withoutUpdatedAt.updatedAtMs;
    expect(
      PlayerSnapshotSchema.safeParse({
        ...snapshot,
        chipActivity: [withoutUpdatedAt],
      }).success,
    ).toBe(false);
  });
});
