import { describe, expect, it } from 'vitest';

import {
  CreateRoomSessionRequestSchema,
  JoinRoomSessionRequestSchema,
  ResumeRoomSessionRequestSchema,
  RoomSessionResponseSchema,
} from './room-session.js';
import { PROTOCOL_VERSION } from './system.js';

describe('room session bootstrap protocol', () => {
  it('validates create, join, and issued reconnect identities', () => {
    expect(
      CreateRoomSessionRequestSchema.safeParse({
        hostNickname: 'Alice',
        settings: {
          roomName: 'Friends',
          maxPlayers: 10,
          initialChips: 1000,
          smallBlind: 1,
          actionTimeoutSeconds: 30,
          handReadyTimeoutSeconds: 30,
          blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
          zeroChipPolicy: 'request-chips',
        },
      }).success,
    ).toBe(true);
    expect(JoinRoomSessionRequestSchema.parse({ nickname: 'Bob' })).toEqual({
      nickname: 'Bob',
    });
    expect(
      ResumeRoomSessionRequestSchema.parse({
        playerId: 'bob',
        token: 'bob-reconnect-token-123456',
        nickname: 'Bobby',
      }),
    ).toEqual({
      playerId: 'bob',
      token: 'bob-reconnect-token-123456',
      nickname: 'Bobby',
    });
    expect(
      ResumeRoomSessionRequestSchema.safeParse({
        playerId: 'bob',
        token: 'bob-reconnect-token-123456',
        nickname: '   ',
      }).success,
    ).toBe(false);
    expect(
      RoomSessionResponseSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        roomId: 'room-1',
        playerId: 'bob',
        token: 'bob-reconnect-token-123456',
        joinUrl: 'http://10.126.126.1:32100/?room=room-1',
        socketPath: '/socket.io',
      }),
    ).toMatchObject({ roomId: 'room-1', playerId: 'bob' });
  });
});
