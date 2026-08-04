import { describe, expect, it } from 'vitest';

import { ShowHoleCardsCommandSchema } from './settlement-commands.js';
import { PROTOCOL_VERSION } from './system.js';

describe('ShowHoleCardsCommandSchema', () => {
  it('accepts a settlement-stage self-reveal command with command identity', () => {
    expect(
      ShowHoleCardsCommandSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        commandId: 'command-1',
        roomId: 'room-1',
        playerId: 'player-1',
        expectedVersion: 4,
        type: 'game.show-hole-cards',
      }),
    ).toMatchObject({ type: 'game.show-hole-cards' });
  });
});
