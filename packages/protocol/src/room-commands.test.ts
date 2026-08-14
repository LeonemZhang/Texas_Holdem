import { describe, expect, it } from 'vitest';

import { PROTOCOL_VERSION } from './system.js';
import { RoomCommandSchema } from './room-commands.js';

const identity = {
  protocolVersion: PROTOCOL_VERSION,
  commandId: 'command-1',
  roomId: 'room-1',
  playerId: 'player-1',
  expectedVersion: 0,
};

describe('RoomCommandSchema', () => {
  it.each([
    { ...identity, type: 'room.join', nickname: 'Bob' },
    { ...identity, type: 'room.set-lobby-ready', ready: true },
    {
      ...identity,
      type: 'room.update-settings',
      settings: {
        roomName: 'Updated friends table',
        maxPlayers: 6,
        initialChips: 200,
        smallBlind: 5,
        actionTimeoutSeconds: 45,
        handReadyTimeoutSeconds: 30,
        blindGrowth: { enabled: false, intervalHands: 10, multiplier: 2 },
        zeroChipPolicy: 'eliminate',
      },
    },
    { ...identity, type: 'room.start-first-hand', handId: 'hand-1' },
    { ...identity, type: 'room.pause' },
    { ...identity, type: 'room.resume' },
    { ...identity, type: 'room.remove-player', targetPlayerId: 'player-2' },
    {
      ...identity,
      type: 'room.reseat-player',
      targetPlayerId: 'player-2',
      seatIndex: 9,
    },
    { ...identity, type: 'room.shuffle-seats' },
    { ...identity, type: 'room.exit' },
    { ...identity, type: 'room.close' },
  ])('parses $type with command and optimistic identity', (command) => {
    expect(RoomCommandSchema.parse(command)).toEqual(command);
  });

  it('parses room creation settings through schema', () => {
    expect(
      RoomCommandSchema.safeParse({
        ...identity,
        type: 'room.create',
        hostNickname: 'Alice',
        settings: {
          roomName: 'Friends',
          maxPlayers: 10,
          initialChips: 2_000,
          smallBlind: 1,
          actionTimeoutSeconds: 30,
          handReadyTimeoutSeconds: 30,
          blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
          zeroChipPolicy: 'request-chips',
        },
      }).success,
    ).toBe(true);
  });

  it('expresses a service-only Host actor without changing the legacy playerId field', () => {
    const result = RoomCommandSchema.safeParse({
      ...identity,
      actorType: 'host',
      hostId: 'host-1',
      hostParticipation: 'service-only',
      type: 'room.create',
      hostNickname: 'Service Host',
      settings: {
        roomName: 'Friends',
        maxPlayers: 6,
        initialChips: 1_000,
        smallBlind: 1,
        actionTimeoutSeconds: 30,
        handReadyTimeoutSeconds: 30,
        blindGrowth: { enabled: false, intervalHands: 10, multiplier: 2 },
        zeroChipPolicy: 'request-chips',
      },
    });
    expect(result.success).toBe(true);
  });

  it('parses a live current blind separately from the base blind', () => {
    const result = RoomCommandSchema.safeParse({
      ...identity,
      type: 'room.update-settings',
      currentSmallBlind: 20,
      settings: {
        roomName: 'Friends',
        maxPlayers: 6,
        initialChips: 1_000,
        smallBlind: 1,
        actionTimeoutSeconds: 30,
        handReadyTimeoutSeconds: 30,
        blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
        zeroChipPolicy: 'request-chips',
      },
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.type === 'room.update-settings') {
      expect(result.data.currentSmallBlind).toBe(20);
      expect(result.data.settings.smallBlind).toBe(1);
    }
  });

  it('parses step growth and a small-blind cap', () => {
    const result = RoomCommandSchema.safeParse({
      ...identity,
      type: 'room.create',
      hostNickname: 'Alice',
      settings: {
        roomName: 'Friends',
        maxPlayers: 10,
        initialChips: 2_000,
        smallBlind: 5,
        actionTimeoutSeconds: 30,
        handReadyTimeoutSeconds: 30,
        blindGrowth: {
          enabled: true,
          intervalHands: 10,
          mode: 'increment',
          increment: 5,
          maxSmallBlind: 100,
        },
        zeroChipPolicy: 'request-chips',
      },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a step below the base small blind and a lower cap', () => {
    expect(
      RoomCommandSchema.safeParse({
        ...identity,
        type: 'room.create',
        hostNickname: 'Alice',
        settings: {
          roomName: 'Friends',
          maxPlayers: 10,
          initialChips: 2_000,
          smallBlind: 5,
          actionTimeoutSeconds: 30,
          handReadyTimeoutSeconds: 30,
          blindGrowth: {
            enabled: true,
            intervalHands: 10,
            mode: 'increment',
            increment: 4,
            maxSmallBlind: 4,
          },
          zeroChipPolicy: 'request-chips',
        },
      }).success,
    ).toBe(false);
  });

  it.each(['commandId', 'roomId', 'playerId', 'expectedVersion'])(
    'rejects a command missing %s',
    (field) => {
      const command: Record<string, unknown> = {
        ...identity,
        type: 'room.pause',
      };
      delete command[field];
      expect(RoomCommandSchema.safeParse(command).success).toBe(false);
    },
  );
});
