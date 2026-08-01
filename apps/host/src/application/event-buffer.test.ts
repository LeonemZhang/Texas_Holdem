import { describe, expect, it } from 'vitest';

import { PROTOCOL_VERSION } from '@texas-holdem/protocol';

import {
  InMemoryEventBuffer,
  type UnsequencedDomainEvent,
} from './event-buffer.js';

function event(
  roomId: string,
  eventId: string,
  type: 'room.control-changed',
  phase: 'playing' | 'paused' | 'closed',
): UnsequencedDomainEvent {
  return {
    protocolVersion: PROTOCOL_VERSION,
    eventId,
    roomId,
    stateVersion: Number(eventId.replace(/\D/g, '')) || 0,
    type,
    phase,
  };
}

describe('InMemoryEventBuffer', () => {
  it('assigns monotonic sequence numbers while preserving batch order', () => {
    const buffer = new InMemoryEventBuffer();
    const first = buffer.append([
      event('room-1', 'event-1', 'room.control-changed', 'playing'),
      event('room-1', 'event-2', 'room.control-changed', 'paused'),
    ]);
    const second = buffer.append([
      event('room-1', 'event-3', 'room.control-changed', 'playing'),
    ]);

    expect([...first, ...second].map(({ sequence }) => sequence)).toEqual([
      1, 2, 3,
    ]);
    expect(
      buffer.readAfter('room-1', 1).events.map(({ eventId }) => eventId),
    ).toEqual(['event-2', 'event-3']);
  });

  it('keeps independent sequence spaces for different rooms', () => {
    const buffer = new InMemoryEventBuffer();
    expect(
      buffer.append([
        event('room-1', 'event-1', 'room.control-changed', 'playing'),
      ])[0]?.sequence,
    ).toBe(1);
    expect(
      buffer.append([
        event('room-2', 'event-1', 'room.control-changed', 'playing'),
      ])[0]?.sequence,
    ).toBe(1);
  });

  it('reports a gap when the requested offset fell out of the bounded buffer', () => {
    const buffer = new InMemoryEventBuffer(2);
    buffer.append([
      event('room-1', 'event-1', 'room.control-changed', 'playing'),
      event('room-1', 'event-2', 'room.control-changed', 'paused'),
      event('room-1', 'event-3', 'room.control-changed', 'closed'),
    ]);

    expect(buffer.readAfter('room-1', 0)).toMatchObject({
      continuous: false,
      oldestSequence: 2,
      latestSequence: 3,
      events: [],
    });
    expect(buffer.readAfter('room-1', 1)).toMatchObject({
      continuous: true,
      oldestSequence: 2,
      latestSequence: 3,
    });
  });
});
