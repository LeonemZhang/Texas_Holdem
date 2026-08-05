import { describe, expect, it, vi } from 'vitest';

import {
  PROTOCOL_VERSION,
  type DomainEvent,
  type PlayerSnapshot,
} from '@texas-holdem/protocol';

import type { ConnectionAdapter } from '../connection/connection.js';
import { GameClientStore } from './game-client-store.js';

const event = (sequence: number): DomainEvent => ({
  protocolVersion: PROTOCOL_VERSION,
  eventId: `event-${sequence}`,
  roomId: 'room-1',
  sequence,
  stateVersion: sequence,
  type: 'room.control-changed',
  phase: 'playing',
});

const snapshot = (sequence: number): PlayerSnapshot => ({
  protocolVersion: PROTOCOL_VERSION,
  roomId: 'room-1',
  playerId: 'host',
  sequence,
  stateVersion: sequence,
  room: {
    roomName: 'Friends',
    phase: 'lobby',
    initialChips: 100,
    smallBlind: 1,
    bigBlind: 2,
    completedHands: 0,
    players: [],
  },
  game: null,
  handReady: null,
  chipRequests: [],
  chipActivity: [],
  statistics: { players: [], titles: [] },
});

function adapter(
  requestResync: ConnectionAdapter['requestResync'],
): ConnectionAdapter {
  return {
    connect: async () => undefined,
    disconnect: () => undefined,
    sendCommand: async () => {
      throw new Error('unused');
    },
    requestResync,
    onConnectionLost: () => () => undefined,
    onDomainEvent: () => () => undefined,
    onSnapshot: () => () => undefined,
  };
}

describe('GameClientStore', () => {
  it('ignores duplicate events and consumes the next sequence once', async () => {
    const connection = adapter(vi.fn());
    const store = new GameClientStore('room-1', 'host', connection);
    await store.consumeEvent(event(1));
    await store.consumeEvent(event(1));
    expect(store.state.sequence).toBe(1);
    expect(store.state.recentEvents).toHaveLength(1);
  });

  it('requests one resynchronization when it discovers an event gap', async () => {
    let resolveResponse!: (
      value: Awaited<ReturnType<ConnectionAdapter['requestResync']>>,
    ) => void;
    const requestResync = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<ConnectionAdapter['requestResync']>>>(
          (resolve) => {
            resolveResponse = resolve;
          },
        ),
    );
    const store = new GameClientStore('room-1', 'host', adapter(requestResync));
    const first = store.consumeEvent(event(2));
    const repeated = store.consumeEvent(event(3));
    expect(requestResync).toHaveBeenCalledTimes(1);
    resolveResponse({
      protocolVersion: PROTOCOL_VERSION,
      status: 'events',
      latestSequence: 3,
      events: [event(1), event(2), event(3)],
    });
    await Promise.all([first, repeated]);
    expect(store.state).toMatchObject({ sequence: 3, synchronizing: false });
  });

  it('replaces all incremental state when resync returns a snapshot', async () => {
    const store = new GameClientStore(
      'room-1',
      'host',
      adapter(async () => ({
        protocolVersion: PROTOCOL_VERSION,
        status: 'snapshot',
        latestSequence: 5,
        snapshot: snapshot(5),
      })),
    );
    await store.consumeEvent(event(3));
    expect(store.state).toMatchObject({
      sequence: 5,
      snapshot: { sequence: 5 },
      recentEvents: [],
    });
  });
});
