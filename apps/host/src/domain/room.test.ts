import { describe, expect, it } from 'vitest';

import { createRoom } from './room.js';
import type { RoomSettingsInput } from './room-settings.js';

export function settings(): RoomSettingsInput {
  return {
    roomName: 'Friends',
    maxPlayers: 6,
    initialChips: 2_000,
    blind: { kind: 'preset', smallBlind: 1 },
    actionTimeoutSeconds: 30,
    handReadyTimeoutSeconds: 30,
    blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
    zeroChipPolicy: 'request-chips',
  };
}

describe('createRoom', () => {
  it('seats the host first as both manager and player', () => {
    const room = createRoom({
      roomId: 'room-1',
      hostPlayerId: 'host-1',
      hostNickname: 'Alice',
      settings: settings(),
    });
    expect(room).toMatchObject({
      hostPlayerId: 'host-1',
      phase: 'lobby',
      firstHandStarted: false,
    });
    expect(room.players).toEqual([
      {
        playerId: 'host-1',
        nickname: 'Alice',
        seatIndex: 0,
        chips: 2_000,
        roles: ['host', 'player'],
        status: 'waiting',
        lobbyReady: true,
      },
    ]);
  });

  it('has no host-only administrator creation path', () => {
    const room = createRoom({
      roomId: 'room-1',
      hostPlayerId: 'host-1',
      hostNickname: 'Alice',
      settings: settings(),
    });
    expect(room.players[0]?.roles).toContain('player');
    expect(room.players[0]?.chips).toBe(room.settings.initialChips);
  });

  it('keeps a service-only host outside the player collection', () => {
    const room = createRoom({
      roomId: 'room-1',
      hostId: 'host-manager',
      hostParticipation: 'service-only',
      hostNickname: 'Alice',
      settings: settings(),
    });

    expect(room).toMatchObject({
      hostId: 'host-manager',
      hostNickname: 'Alice',
      hostParticipation: 'service-only',
      hostPlayerId: '',
      phase: 'lobby',
    });
    expect(room.players).toEqual([]);
  });

  it('supports distinct host and player identities in player mode', () => {
    const room = createRoom({
      roomId: 'room-1',
      hostId: 'host-manager',
      hostPlayerId: 'host-player',
      hostNickname: 'Alice',
      settings: settings(),
    });

    expect(room.hostId).toBe('host-manager');
    expect(room.players[0]?.playerId).toBe('host-player');
    expect(room.players[0]?.roles).toEqual(['host', 'player']);
  });

  it('does not accept a player identity for a service-only host', () => {
    expect(() =>
      createRoom({
        roomId: 'room-1',
        hostId: 'host-manager',
        hostPlayerId: 'host-player',
        hostParticipation: 'service-only',
        hostNickname: 'Alice',
        settings: settings(),
      }),
    ).toThrow('Service-only hosts cannot have a player identity');
  });
});
