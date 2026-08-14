import { describe, expect, it } from 'vitest';

import { joinRoom } from './join-room.js';
import { createRoom } from './room.js';
import { updateRoomSettings } from './update-room-settings.js';
import type { RoomSettingsInput } from './room-settings.js';

function settings(initialChips = 100): RoomSettingsInput {
  return {
    roomName: 'Friends',
    maxPlayers: 3,
    initialChips,
    blind: { kind: 'preset', smallBlind: 1 },
    actionTimeoutSeconds: 30,
    handReadyTimeoutSeconds: 30,
    blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
    zeroChipPolicy: 'request-chips',
  };
}

function serviceOnlyRoom() {
  const room = createRoom({
    roomId: 'room',
    hostId: 'host-manager',
    hostParticipation: 'service-only',
    hostNickname: 'Alice',
    settings: settings(),
  });
  return joinRoom(room, { playerId: 'bob', nickname: 'Bob' });
}

describe('updateRoomSettings', () => {
  it('updates service-only room settings for actual players only', () => {
    const updated = updateRoomSettings(
      serviceOnlyRoom(),
      'host-manager',
      settings(250),
    );

    expect(updated.players).toHaveLength(1);
    expect(updated.players[0]?.chips).toBe(250);
    expect(updated.hostParticipation).toBe('service-only');
  });

  it('requires the independent host identity', () => {
    expect(() =>
      updateRoomSettings(serviceOnlyRoom(), 'bob', settings(250)),
    ).toThrow('Only the host can update room settings');
  });

  it('allows live settings and an authoritative current blind while locking base settings', () => {
    const room = serviceOnlyRoom();
    const started = {
      ...room,
      phase: 'hand-ready' as const,
      firstHandStarted: true,
      players: room.players.map((player) => ({
        ...player,
        status: 'sitting-out' as const,
        chips: 37,
      })),
    };
    const updated = updateRoomSettings(
      started,
      'host-manager',
      {
        ...settings(),
        actionTimeoutSeconds: 12,
        blindGrowth: {
          enabled: true,
          intervalHands: 4,
          multiplier: 3,
        },
      },
      { currentSmallBlind: 20, completedHands: 5 },
    );

    expect(updated.settings.smallBlind).toBe(1);
    expect(updated.currentSmallBlind).toBe(20);
    expect(updated.currentBigBlind).toBe(40);
    expect(updated.nextBlindGrowthAtCompletedHands).toBe(9);
    expect(updated.players[0]?.chips).toBe(37);
    expect(() =>
      updateRoomSettings(
        started,
        'host-manager',
        { ...settings(), initialChips: 200 },
        { currentSmallBlind: 20, completedHands: 5 },
      ),
    ).toThrow('locked after the first hand');
  });
});
