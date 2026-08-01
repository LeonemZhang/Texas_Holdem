import { describe, expect, it } from 'vitest';

import { PROTOCOL_VERSION } from '@texas-holdem/protocol';

import {
  DISCOVERY_MAGIC,
  DiscoveryRequestSchema,
  RoomDiscoveryResponseSchema,
} from './messages.js';

const request = {
  magic: DISCOVERY_MAGIC,
  protocolVersion: PROTOCOL_VERSION,
  requestId: 'scan-1',
  type: 'discover' as const,
};
const response = {
  ...request,
  type: 'room' as const,
  roomId: 'room-1',
  roomName: 'Friends',
  hostNickname: 'Alice',
  hostAddress: '10.126.126.1',
  httpPort: 32100,
  playerCount: 2,
  maxPlayers: 10,
  smallBlind: 1,
  bigBlind: 2,
  phase: 'lobby' as const,
};

describe('LAN discovery messages', () => {
  it('requires the magic, shared version and request identity', () => {
    expect(DiscoveryRequestSchema.parse(request)).toEqual(request);
    expect(
      DiscoveryRequestSchema.safeParse({ ...request, magic: 'OTHER' }).success,
    ).toBe(false);
    expect(
      DiscoveryRequestSchema.safeParse({ ...request, protocolVersion: '999' })
        .success,
    ).toBe(false);
  });

  it('accepts only a bounded public room summary', () => {
    expect(RoomDiscoveryResponseSchema.parse(response)).toEqual(response);
    expect(
      RoomDiscoveryResponseSchema.safeParse({
        ...response,
        playerCount: 11,
      }).success,
    ).toBe(false);
  });

  it.each(['password', 'token', 'holeCards', 'deck'])(
    'rejects sensitive or private field %s from broadcast responses',
    (field) => {
      expect(
        RoomDiscoveryResponseSchema.safeParse({
          ...response,
          [field]: 'must-not-broadcast',
        }).success,
      ).toBe(false);
    },
  );
});
