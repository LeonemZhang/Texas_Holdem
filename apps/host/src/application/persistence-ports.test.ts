import { describe, expect, it } from 'vitest';

import { PROTOCOL_VERSION, type DomainEvent } from '@texas-holdem/protocol';

import type {
  PersistenceUnitOfWork,
  StoredCommandResult,
  StoredRoomSnapshot,
  TransactionPort,
} from './persistence-ports.js';

describe('persistence application ports', () => {
  it('allows events and command acknowledgements to share one abstract transaction', () => {
    const events: DomainEvent[] = [];
    const commands: StoredCommandResult[] = [];
    const snapshots: StoredRoomSnapshot[] = [];
    const stores: PersistenceUnitOfWork = {
      events: {
        append: (next) => events.push(...next),
        readAfter: (roomId, sequence) =>
          events.filter(
            (event) => event.roomId === roomId && event.sequence > sequence,
          ),
        latestSequence: (roomId) =>
          events
            .filter((event) => event.roomId === roomId)
            .reduce((latest, event) => Math.max(latest, event.sequence), 0),
      },
      snapshots: {
        save: (snapshot) => snapshots.push(snapshot),
        latest: (roomId) =>
          [...snapshots]
            .reverse()
            .find((snapshot) => snapshot.roomId === roomId) ?? null,
      },
      commands: {
        save: (result) => commands.push(result),
        find: (roomId, playerId, commandId) =>
          commands.find(
            (result) =>
              result.roomId === roomId &&
              result.playerId === playerId &&
              result.commandId === commandId,
          ) ?? null,
      },
    };
    const transactions: TransactionPort = {
      run: (operation) => operation(stores),
    };
    const event: DomainEvent = {
      protocolVersion: PROTOCOL_VERSION,
      eventId: 'event-1',
      roomId: 'room-1',
      sequence: 1,
      stateVersion: 1,
      type: 'room.control-changed',
      phase: 'playing',
    };

    transactions.run((unit) => {
      unit.events.append([event]);
      unit.commands.save({
        roomId: 'room-1',
        playerId: 'host',
        commandId: 'command-1',
        response: {
          protocolVersion: PROTOCOL_VERSION,
          commandId: 'command-1',
          status: 'accepted',
          stateVersion: 1,
          sequence: 1,
        },
      });
    });

    expect(stores.events.latestSequence('room-1')).toBe(1);
    expect(
      stores.commands.find('room-1', 'host', 'command-1')?.response,
    ).toMatchObject({
      status: 'accepted',
      sequence: 1,
    });
  });
});
