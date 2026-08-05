import { describe, expect, it } from 'vitest';

import { HandReadyCommandSchema } from './hand-ready-commands.js';
import { PROTOCOL_VERSION } from './system.js';

const identity = {
  protocolVersion: PROTOCOL_VERSION,
  commandId: 'command-1',
  roomId: 'room-1',
  playerId: 'player-1',
  expectedVersion: 4,
};

describe('HandReadyCommandSchema', () => {
  it('requires a specific player for chip requests', () => {
    expect(
      HandReadyCommandSchema.safeParse({
        ...identity,
        type: 'chips.request',
        requestId: 'request-1',
        targetPlayerId: 'player-2',
        amount: 20,
      }).success,
    ).toBe(true);
    expect(
      HandReadyCommandSchema.safeParse({
        ...identity,
        type: 'chips.request',
        audience: 'table',
        requestId: 'request-2',
        amount: 20,
      }).success,
    ).toBe(false);
    expect(
      HandReadyCommandSchema.safeParse({
        ...identity,
        type: 'chips.request',
        requestId: 'request-3',
        amount: 20,
      }).success,
    ).toBe(false);
  });

  it.each([
    { ...identity, type: 'hand-ready.set-choice', choice: 'ready' },
    { ...identity, type: 'chips.revoke', requestId: 'request-1' },
    { ...identity, type: 'chips.reject', requestId: 'request-1' },
    {
      ...identity,
      type: 'chips.approve',
      requestId: 'request-1',
      transferId: 'transfer-1',
    },
    {
      ...identity,
      type: 'chips.give',
      transferId: 'transfer-1',
      receiverPlayerId: 'player-2',
      amount: 10,
    },
  ])('parses $type as an independently distinguishable command', (command) => {
    expect(HandReadyCommandSchema.safeParse(command).success).toBe(true);
  });
});
