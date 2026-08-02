import { describe, expect, it } from 'vitest';

import {
  RoomRecordManagementRequestSchema,
  RoomRecordSummarySchema,
} from './room-records.js';
import { PROTOCOL_VERSION } from './system.js';

const request = {
  protocolVersion: PROTOCOL_VERSION,
  requestId: 'request-1',
};

describe('room record protocol schemas', () => {
  it.each([
    { ...request, type: 'room-record.list', includeArchived: false },
    {
      ...request,
      type: 'room-record.create',
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
    },
    { ...request, type: 'room-record.recover', roomId: 'room-1' },
    { ...request, type: 'room-record.archive', roomId: 'room-1' },
    { ...request, type: 'room-record.restore', roomId: 'room-1' },
    { ...request, type: 'room-record.delete', roomId: 'room-1' },
    { ...request, type: 'room-record.get', roomId: 'room-1' },
  ])('parses $type as a versioned management request', (value) => {
    expect(RoomRecordManagementRequestSchema.parse(value)).toEqual(value);
  });

  it('accepts public record metadata without player secrets or cards', () => {
    expect(
      RoomRecordSummarySchema.parse({
        roomId: 'room-1',
        roomName: 'Friday poker',
        hostNickname: 'Alice',
        status: 'recoverable',
        createdAt: '2026-08-02T01:00:00.000Z',
        lastActiveAt: '2026-08-02T02:00:00.000Z',
        completedHands: 12,
        playerCount: 4,
      }),
    ).toMatchObject({ status: 'recoverable', completedHands: 12 });
  });

  it.each([
    { ...request, type: 'room-record.recover', roomId: '' },
    { ...request, type: 'room-record.list' },
    {
      roomId: 'room-1',
      roomName: 'Friends',
      hostNickname: 'Alice',
      status: 'unknown',
      createdAt: 'not-a-date',
      lastActiveAt: '2026-08-02T02:00:00.000Z',
      completedHands: -1,
      playerCount: 0,
    },
  ])('rejects an invalid record management boundary', (value) => {
    const schema =
      'type' in value
        ? RoomRecordManagementRequestSchema
        : RoomRecordSummarySchema;
    expect(schema.safeParse(value).success).toBe(false);
  });
});
