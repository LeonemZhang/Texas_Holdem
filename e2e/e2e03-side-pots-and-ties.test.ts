import { describe, expect, it } from 'vitest';

import {
  buildPots,
  distributePots,
  HAND_CATEGORY,
  type HandRank,
  type Seat,
} from '../packages/poker-core/src/index.js';
import {
  PlayerSnapshotSchema,
  PROTOCOL_VERSION,
} from '../packages/protocol/src/index.js';

describe('LUNA-E2E03 all-ins, side pots, ties, and odd chips', () => {
  it('keeps every side pot conserved while sending only total and street history to the UI', () => {
    const pots = buildPots([
      { playerId: 'alice', amount: 5, folded: false },
      { playerId: 'bob', amount: 10, folded: false },
      { playerId: 'carol', amount: 10, folded: false },
    ]);
    expect(pots).toMatchObject([
      { amount: 15, eligiblePlayerIds: ['alice', 'bob', 'carol'] },
      { amount: 10, eligiblePlayerIds: ['bob', 'carol'] },
    ]);

    const tiedBest: HandRank = [HAND_CATEGORY.STRAIGHT_FLUSH, 14];
    const lower: HandRank = [HAND_CATEGORY.FOUR_OF_A_KIND, 13, 12];
    const seats: Seat[] = [
      { index: 0, playerId: 'alice', status: 'active' },
      { index: 1, playerId: 'bob', status: 'active' },
      { index: 2, playerId: 'carol', status: 'active' },
    ];
    const distribution = distributePots(
      pots,
      { alice: tiedBest, bob: tiedBest, carol: lower },
      seats,
      2,
    );
    expect(distribution.awards[0]).toMatchObject({
      winnerIds: ['alice', 'bob'],
      equalShare: 7,
      oddChipWinnerIds: ['alice'],
    });
    expect(distribution.payouts).toEqual({ alice: 8, bob: 17 });
    expect(
      Object.values(distribution.payouts).reduce(
        (sum, value) => sum + value,
        0,
      ),
    ).toBe(25);
    const snapshot = PlayerSnapshotSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      roomId: 'room-1',
      playerId: 'alice',
      sequence: 9,
      stateVersion: 12,
      room: {
        roomName: '朋友局',
        phase: 'playing',
        initialChips: 100,
        smallBlind: 1,
        bigBlind: 2,
        completedHands: 0,
        players: seats.map((seat, index) => ({
          playerId: seat.playerId,
          nickname: seat.playerId,
          seatIndex: seat.index,
          chips: 0,
          status: 'all-in',
          isHost: index === 0,
          lobbyReady: true,
        })),
      },
      game: {
        handId: 'hand-1',
        street: 'river',
        buttonPlayerId: 'carol',
        smallBlindPlayerId: 'alice',
        bigBlindPlayerId: 'bob',
        currentActorId: null,
        communityCards: ['2c', '3d', '4h', '5s', '6c'],
        totalPot: 25,
        streetPots: [{ street: 'river', amount: 25 }],
        ownHoleCards: ['Ah', 'Ks'],
        legalActions: null,
      },
      handReady: null,
      chipRequests: [],
      chipActivity: [],
      statistics: { players: [], titles: [] },
    });
    expect(snapshot.game?.totalPot).toBe(25);
    expect(snapshot.game?.streetPots).toEqual([
      { street: 'river', amount: 25 },
    ]);
  });
});
