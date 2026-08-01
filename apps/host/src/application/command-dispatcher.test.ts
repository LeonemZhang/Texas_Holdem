import { describe, expect, it, vi } from 'vitest';

import { PROTOCOL_VERSION } from '@texas-holdem/protocol';

import { createRoom } from '../domain/room.js';
import { CommandDispatcher } from './command-dispatcher.js';
import { InMemoryRoomRegistry } from './room-registry.js';

const command = {
  protocolVersion: PROTOCOL_VERSION,
  commandId: 'command-1',
  roomId: 'room-1',
  playerId: 'host',
  expectedVersion: 0,
  type: 'room.pause',
} as const;

function registry() {
  const rooms = new InMemoryRoomRegistry();
  rooms.save(
    createRoom({
      roomId: 'room-1',
      hostPlayerId: 'host',
      hostNickname: 'Alice',
      settings: {
        roomName: 'Friends',
        maxPlayers: 10,
        initialChips: 100,
        blind: { kind: 'preset', smallBlind: 1 },
        actionTimeoutSeconds: 30,
        handReadyTimeoutSeconds: 30,
        blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
        zeroChipPolicy: 'request-chips',
      },
    }),
  );
  return rooms;
}

describe('CommandDispatcher', () => {
  it('rejects invalid schema before the domain handler', () => {
    const handle = vi.fn(() => ({ stateVersion: 1, sequence: 1 }));
    const dispatcher = new CommandDispatcher(registry(), () => true, handle);
    expect(
      dispatcher.dispatch({ ...command, expectedVersion: -1 }).status,
    ).toBe('rejected');
    expect(handle).not.toHaveBeenCalled();
  });

  it('maps optimistic version conflicts without entering the domain', () => {
    const handle = vi.fn(() => ({ stateVersion: 1, sequence: 1 }));
    const dispatcher = new CommandDispatcher(registry(), () => true, handle);
    expect(dispatcher.dispatch({ ...command, expectedVersion: 9 }).status).toBe(
      'conflict',
    );
    expect(handle).not.toHaveBeenCalled();
  });

  it('checks identity permission before the domain handler', () => {
    const handle = vi.fn(() => ({ stateVersion: 1, sequence: 1 }));
    const dispatcher = new CommandDispatcher(registry(), () => false, handle);
    expect(dispatcher.dispatch(command).status).toBe('unauthorized');
    expect(handle).not.toHaveBeenCalled();
  });

  it('accepts a valid command but intentionally has no idempotency cache yet', () => {
    const handle = vi.fn(() => ({ stateVersion: 1, sequence: 1 }));
    const dispatcher = new CommandDispatcher(registry(), () => true, handle);
    expect(dispatcher.dispatch(command).status).toBe('accepted');
    expect(dispatcher.dispatch(command).status).toBe('accepted');
    expect(handle).toHaveBeenCalledTimes(2);
  });
});
