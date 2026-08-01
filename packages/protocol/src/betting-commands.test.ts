import { describe, expect, it } from 'vitest';

import { BettingCommandSchema } from './betting-commands.js';
import { PROTOCOL_VERSION } from './system.js';

const identity = {
  protocolVersion: PROTOCOL_VERSION,
  commandId: 'command-1',
  roomId: 'room-1',
  playerId: 'player-1',
  expectedVersion: 9,
};

describe('BettingCommandSchema', () => {
  it.each(['fold', 'check', 'call', 'all-in'])(
    'parses game.%s with complete command identity',
    (action) => {
      expect(
        BettingCommandSchema.safeParse({
          ...identity,
          type: `game.${action}`,
        }).success,
      ).toBe(true);
    },
  );

  it('expresses raise-to using only the final total amount', () => {
    const parsed = BettingCommandSchema.parse({
      ...identity,
      type: 'game.raise-to',
      amount: 120,
    });
    expect(parsed).toEqual({
      ...identity,
      type: 'game.raise-to',
      amount: 120,
    });
    expect('increment' in parsed).toBe(false);
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid raise target %s',
    (amount) => {
      expect(
        BettingCommandSchema.safeParse({
          ...identity,
          type: 'game.raise-to',
          amount,
        }).success,
      ).toBe(false);
    },
  );
});
