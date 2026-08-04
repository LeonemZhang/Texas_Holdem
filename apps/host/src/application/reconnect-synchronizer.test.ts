import { describe, expect, it } from 'vitest';

import { PROTOCOL_VERSION, type PlayerSnapshot } from '@texas-holdem/protocol';

import { InMemoryEventBuffer } from './event-buffer.js';
import { ReconnectSynchronizer } from './reconnect-synchronizer.js';

const identity = { roomId: 'room-1', playerId: 'host' };
const request = {
  protocolVersion: PROTOCOL_VERSION,
  roomId: 'room-1',
  playerId: 'host',
  offset: 0,
};

function append(buffer: InMemoryEventBuffer, eventId: string) {
  buffer.append([
    {
      protocolVersion: PROTOCOL_VERSION,
      eventId,
      roomId: 'room-1',
      stateVersion: Number(eventId.replace(/\D/g, '')),
      type: 'room.control-changed',
      phase: 'playing',
    },
  ]);
}

function snapshot(sequence: number): PlayerSnapshot {
  return {
    protocolVersion: PROTOCOL_VERSION,
    roomId: 'room-1',
    playerId: 'host',
    sequence,
    stateVersion: 2,
    room: {
      roomName: 'Friends',
      phase: 'lobby',
      initialChips: 100,
      smallBlind: 1,
      bigBlind: 2,
      completedHands: 0,
      players: [
        {
          playerId: 'host',
          nickname: 'Alice',
          seatIndex: 0,
          chips: 100,
          streetCommitted: 0,
          totalCommitted: 0,
          status: 'waiting',
          isHost: true,
          lobbyReady: false,
        },
      ],
    },
    game: null,
    handReady: null,
    chipRequests: [],
    statistics: { players: [], titles: [] },
  };
}

describe('ReconnectSynchronizer', () => {
  it('returns all continuous events after the client offset', () => {
    const events = new InMemoryEventBuffer();
    append(events, 'event-1');
    append(events, 'event-2');
    const synchronizer = new ReconnectSynchronizer(events, () => null);

    expect(
      synchronizer.synchronize(identity, { ...request, offset: 1 }),
    ).toMatchObject({
      status: 'events',
      latestSequence: 2,
      events: [{ eventId: 'event-2', sequence: 2 }],
    });
  });

  it('returns a player snapshot when the event offset fell out of the buffer', () => {
    const events = new InMemoryEventBuffer(1);
    append(events, 'event-1');
    append(events, 'event-2');
    const synchronizer = new ReconnectSynchronizer(
      events,
      (_room, _player, sequence) => snapshot(sequence),
    );

    expect(synchronizer.synchronize(identity, request)).toMatchObject({
      status: 'snapshot',
      latestSequence: 2,
      snapshot: { playerId: 'host', sequence: 2 },
    });
  });

  it('returns an explicit failure when a required snapshot is unavailable', () => {
    const events = new InMemoryEventBuffer(1);
    append(events, 'event-1');
    append(events, 'event-2');
    const synchronizer = new ReconnectSynchronizer(events, () => null);

    expect(synchronizer.synchronize(identity, request)).toMatchObject({
      status: 'failed',
      error: { code: 'RESYNC_REQUIRED' },
    });
  });
});
