import { describe, expect, it } from 'vitest';

import {
  HostManagementSnapshotSchema,
  type HostManagementSnapshot,
} from './host-snapshot.js';
import { PROTOCOL_VERSION } from './system.js';

const base: HostManagementSnapshot = {
  protocolVersion: PROTOCOL_VERSION,
  roomId: 'room-1',
  hostId: 'host-1',
  hostParticipation: 'service-only',
  sequence: 4,
  stateVersion: 4,
  room: {
    roomName: 'Friends',
    phase: 'playing',
    settings: {
      roomName: 'Friends',
      maxPlayers: 6,
      initialChips: 1_000,
      smallBlind: 1,
      actionTimeoutSeconds: 30,
      handReadyTimeoutSeconds: 30,
      blindGrowth: { enabled: false, intervalHands: 10, multiplier: 2 },
      zeroChipPolicy: 'request-chips',
    },
    currentSmallBlind: 1,
    currentBigBlind: 2,
    completedHands: 0,
    players: [],
  },
  game: null,
  handReady: null,
};

describe('HostManagementSnapshotSchema', () => {
  it('accepts a public management projection', () => {
    expect(HostManagementSnapshotSchema.parse(base)).toEqual(base);
  });

  it('does not accept player-private fields in the management game projection', () => {
    const parsed = HostManagementSnapshotSchema.safeParse({
      ...base,
      game: {
        handId: 'hand-1',
        street: 'flop',
        buttonPlayerId: 'p-1',
        smallBlindPlayerId: 'p-1',
        bigBlindPlayerId: 'p-2',
        currentActorId: 'p-2',
        actionDeadlineMs: null,
        communityCards: ['2c'],
        totalPot: 10,
        streetPots: [],
        ownHoleCards: ['As', 'Kd'],
      },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect('ownHoleCards' in parsed.data.game!).toBe(false);
    }
  });

  it('accepts only publicly revealed showdown cards and settlement results', () => {
    const parsed = HostManagementSnapshotSchema.parse({
      ...base,
      game: {
        handId: 'hand-1',
        handNumber: 1,
        street: 'settled',
        buttonPlayerId: 'p-1',
        smallBlindPlayerId: 'p-1',
        bigBlindPlayerId: 'p-2',
        currentActorId: null,
        actionDeadlineMs: null,
        communityCards: ['2c', '7d', 'Jh', 'Qs', 'Ac'],
        totalPot: 100,
        streetPots: [],
        showdownHoleCards: { 'p-1': ['As', 'Kd'], 'p-2': ['Qh', 'Qc'] },
        settlement: {
          reason: 'showdown',
          winnerIds: ['p-1'],
          payouts: { 'p-1': 100 },
          netChanges: { 'p-1': 50, 'p-2': -50 },
          showdownResults: [
            {
              playerId: 'p-1',
              handType: 'straight',
              bestFiveCards: ['Ac', 'Kd', 'Qs', 'Jh', 'Tc'],
            },
          ],
          voluntaryRevealedHoleCards: {},
        },
      },
    });

    expect(parsed.game?.showdownHoleCards).toEqual({
      'p-1': ['As', 'Kd'],
      'p-2': ['Qh', 'Qc'],
    });
    expect(parsed.game?.settlement?.winnerIds).toEqual(['p-1']);
    expect('legalActions' in parsed.game!).toBe(false);
    expect('deck' in parsed.game!).toBe(false);
  });
});
