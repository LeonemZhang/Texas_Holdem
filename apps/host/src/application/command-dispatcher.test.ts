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

  it('returns the original response without applying a repeated player command', () => {
    const handle = vi.fn(() => ({ stateVersion: 1, sequence: 1 }));
    const dispatcher = new CommandDispatcher(registry(), () => true, handle);
    const first = dispatcher.dispatch(command);
    const repeated = dispatcher.dispatch(command);
    expect(first.status).toBe('accepted');
    expect(repeated).toBe(first);
    expect(handle).toHaveBeenCalledTimes(1);
  });

  it('isolates command idempotency keys between players', () => {
    const handle = vi
      .fn()
      .mockReturnValueOnce({ stateVersion: 1, sequence: 1 })
      .mockReturnValueOnce({ stateVersion: 2, sequence: 2 });
    const dispatcher = new CommandDispatcher(registry(), () => true, handle);
    const hostResult = dispatcher.dispatch(command);
    const guestResult = dispatcher.dispatch({ ...command, playerId: 'guest' });
    expect(hostResult).not.toBe(guestResult);
    expect(guestResult).toMatchObject({ stateVersion: 2, sequence: 2 });
    expect(handle).toHaveBeenCalledTimes(2);
  });
});
