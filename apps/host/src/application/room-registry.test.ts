import { describe, expect, it } from 'vitest';

import { createRoom } from '../domain/room.js';
import { InMemoryRoomRegistry, type RoomRepository } from './room-registry.js';

function room(roomId: string) {
  return createRoom({
    roomId,
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
  });
}

function lookup(repository: RoomRepository, roomId: string) {
  return repository.get(roomId);
}

describe('InMemoryRoomRegistry', () => {
  it('looks up immutable rooms by room id through the application port', () => {
    const registry = new InMemoryRoomRegistry();
    registry.save(room('room-b'));
    const found = lookup(registry, 'room-b');
    expect(found?.roomId).toBe('room-b');
    expect(Object.isFrozen(found)).toBe(true);
    expect(Object.isFrozen(found?.players)).toBe(true);
  });

  it('does not expose a mutable map or mutable room object', () => {
    const registry = new InMemoryRoomRegistry();
    registry.save(room('room-a'));
    const found = registry.get('room-a');
    expect(() => {
      (found as { phase: string }).phase = 'closed';
    }).toThrow();
    expect(registry.get('room-a')?.phase).toBe('lobby');
    expect('rooms' in registry).toBe(false);
  });

  it('returns stable sorted room ids and null for a missing room', () => {
    const registry = new InMemoryRoomRegistry();
    registry.save(room('room-b'));
    registry.save(room('room-a'));
    expect(registry.listRoomIds()).toEqual(['room-a', 'room-b']);
    expect(registry.get('missing')).toBeNull();
  });
});
