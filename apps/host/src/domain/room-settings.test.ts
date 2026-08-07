import { describe, expect, it } from 'vitest';

import {
  PRESET_SMALL_BLINDS,
  validateRoomSettings,
  type RoomSettingsInput,
} from './room-settings.js';
import { joinRoom } from './join-room.js';
import { createRoom } from './room.js';
import { updateRoomSettings } from './update-room-settings.js';

function validInput(): RoomSettingsInput {
  return {
    roomName: ' Friends Table ',
    maxPlayers: 10,
    initialChips: 2_000,
    blind: { kind: 'preset', smallBlind: 1 },
    actionTimeoutSeconds: 30,
    handReadyTimeoutSeconds: 30,
    blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
    zeroChipPolicy: 'request-chips',
  };
}

describe('validateRoomSettings', () => {
  it('accepts every documented blind preset and always derives its big blind', () => {
    for (const smallBlind of PRESET_SMALL_BLINDS) {
      const settings = validateRoomSettings({
        ...validInput(),
        blind: { kind: 'preset', smallBlind },
      });
      expect(settings.bigBlind).toBe(smallBlind * 2);
    }
  });

  it('accepts a custom small blind and normalizes the room name', () => {
    const settings = validateRoomSettings({
      ...validInput(),
      blind: { kind: 'custom', smallBlind: 3 },
    });
    expect(settings).toMatchObject({
      roomName: 'Friends Table',
      smallBlind: 3,
      bigBlind: 6,
      zeroChipPolicy: 'request-chips',
    });
  });

  it.each([1, 11])('rejects a %s-player room boundary', (maxPlayers) => {
    expect(() => validateRoomSettings({ ...validInput(), maxPlayers })).toThrow(
      'Maximum players must be between 2 and 10',
    );
  });

  it('rejects invalid chips, timers, growth, and an empty room name', () => {
    expect(() =>
      validateRoomSettings({ ...validInput(), initialChips: 0 }),
    ).toThrow('Initial chips must be a positive safe integer');
    expect(() =>
      validateRoomSettings({ ...validInput(), actionTimeoutSeconds: 0 }),
    ).toThrow('Action timeout must be a positive safe integer');
    expect(() =>
      validateRoomSettings({
        ...validInput(),
        blindGrowth: { enabled: true, intervalHands: 5, multiplier: 1 },
      }),
    ).toThrow('Blind growth multiplier must be greater than one');
    expect(() =>
      validateRoomSettings({ ...validInput(), roomName: ' ' }),
    ).toThrow('Room name cannot be empty');
  });
});

describe('updateRoomSettings', () => {
  const input: RoomSettingsInput = {
    roomName: 'Friends Table',
    maxPlayers: 10,
    initialChips: 100,
    blind: { kind: 'preset', smallBlind: 1 },
    actionTimeoutSeconds: 30,
    handReadyTimeoutSeconds: 30,
    blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
    zeroChipPolicy: 'request-chips',
  };

  it('updates settings and lobby balances without changing readiness', () => {
    let room = createRoom({
      roomId: 'room-1',
      hostPlayerId: 'host',
      hostNickname: 'Alice',
      settings: input,
    });
    room = joinRoom(room, { playerId: 'bob', nickname: 'Bob' });
    room = {
      ...room,
      players: room.players.map((player) =>
        player.playerId === 'bob' ? { ...player, lobbyReady: true } : player,
      ),
    };

    const updated = updateRoomSettings(room, 'host', {
      ...input,
      roomName: 'New table',
      maxPlayers: 4,
      initialChips: 250,
      blind: { kind: 'custom', smallBlind: 3 },
    });

    expect(updated.settings).toMatchObject({
      roomName: 'New table',
      maxPlayers: 4,
      initialChips: 250,
      smallBlind: 3,
      bigBlind: 6,
    });
    expect(
      updated.players.map(({ chips, lobbyReady }) => [chips, lobbyReady]),
    ).toEqual([
      [250, true],
      [250, true],
    ]);
    expect(updated.version).toBe(2);
  });

  it('rejects reducing capacity below the current player count', () => {
    let room = createRoom({
      roomId: 'room-1',
      hostPlayerId: 'host',
      hostNickname: 'Alice',
      settings: input,
    });
    room = joinRoom(room, { playerId: 'bob', nickname: 'Bob' });

    expect(() =>
      updateRoomSettings(room, 'host', { ...input, maxPlayers: 1 }),
    ).toThrow('Maximum players must be between 2 and 10');
    expect(() =>
      updateRoomSettings(room, 'host', { ...input, maxPlayers: 2 }),
    ).not.toThrow();
  });

  it('rejects non-host and post-first-hand updates', () => {
    let room = createRoom({
      roomId: 'room-1',
      hostPlayerId: 'host',
      hostNickname: 'Alice',
      settings: input,
    });
    room = joinRoom(room, { playerId: 'bob', nickname: 'Bob' });
    expect(() => updateRoomSettings(room, 'bob', input)).toThrow(
      'Only the host can update room settings',
    );

    expect(() =>
      updateRoomSettings(
        { ...room, phase: 'playing', firstHandStarted: true },
        'host',
        input,
      ),
    ).toThrow('Room settings can only change before the first hand');
  });
});
