import { describe, expect, it } from 'vitest';

import {
  assignHeadsUpPositions,
  headsUpActionOrderForStreet,
} from './positions.js';
import type { Seat } from './seats.js';

function active(...indexes: readonly number[]): readonly Seat[] {
  return indexes.map((index) => ({
    index,
    playerId: `p${index}`,
    status: 'active' as const,
  }));
}

describe('table positions', () => {
  it('makes the heads-up button the small blind', () => {
    const positions = assignHeadsUpPositions(active(2, 7), null);

    expect(positions.button.index).toBe(2);
    expect(positions.smallBlind.index).toBe(2);
    expect(positions.bigBlind.index).toBe(7);
    expect(headsUpActionOrderForStreet(positions, 'preflop')[0]?.index).toBe(2);
    expect(headsUpActionOrderForStreet(positions, 'flop')[0]?.index).toBe(7);
  });

  it('rotates heads-up roles after every hand', () => {
    const positions = assignHeadsUpPositions(active(2, 7), 2);
    expect(positions.button.index).toBe(7);
    expect(positions.bigBlind.index).toBe(2);
  });
});
