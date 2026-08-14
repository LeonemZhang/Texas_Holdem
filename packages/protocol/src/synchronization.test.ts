import { describe, expect, it } from 'vitest';

import { PROTOCOL_VERSION } from './system.js';
import {
  ResyncHostResponseSchema,
  ResyncRequestSchema,
  ResyncResponseSchema,
} from './synchronization.js';

describe('resynchronization protocol', () => {
  it('accepts an offset request and ordered event response', () => {
    expect(
      ResyncRequestSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        roomId: 'room-1',
        playerId: 'host',
        offset: 4,
      }),
    ).toMatchObject({ offset: 4 });
    expect(
      ResyncRequestSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        roomId: 'room-1',
        playerId: 'host-1',
        hostId: 'host-1',
        sessionType: 'host',
        offset: 4,
      }),
    ).toMatchObject({ sessionType: 'host', hostId: 'host-1' });
    expect(
      ResyncResponseSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        status: 'events',
        latestSequence: 5,
        events: [
          {
            protocolVersion: PROTOCOL_VERSION,
            eventId: 'event-5',
            roomId: 'room-1',
            sequence: 5,
            stateVersion: 5,
            type: 'room.control-changed',
            phase: 'playing',
          },
        ],
      }).status,
    ).toBe('events');
  });

  it('rejects a negative offset', () => {
    expect(
      ResyncRequestSchema.safeParse({
        protocolVersion: PROTOCOL_VERSION,
        roomId: 'room-1',
        playerId: 'host',
        offset: -1,
      }).success,
    ).toBe(false);
  });

  it('keeps Host resync snapshots separate from the Player response contract', () => {
    const response = ResyncHostResponseSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      status: 'snapshot',
      latestSequence: 4,
      snapshot: {
        protocolVersion: PROTOCOL_VERSION,
        roomId: 'room-1',
        hostId: 'host-1',
        hostParticipation: 'service-only',
        sequence: 4,
        stateVersion: 4,
        room: {
          roomName: 'Friends',
          phase: 'lobby',
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
      },
    });
    expect(response.status).toBe('snapshot');
  });
});
