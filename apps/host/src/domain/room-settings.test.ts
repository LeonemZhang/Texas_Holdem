import { describe, expect, it } from 'vitest';

import {
  PRESET_SMALL_BLINDS,
  validateRoomSettings,
  type RoomSettingsInput,
} from './room-settings.js';

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
