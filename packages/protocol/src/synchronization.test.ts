import { describe, expect, it } from 'vitest';

import { PROTOCOL_VERSION } from './system.js';
import {
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
});
