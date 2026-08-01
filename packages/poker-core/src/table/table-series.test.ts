import { describe, expect, it } from 'vitest';

import { applyPreflopAction } from '../hand/preflop-reducer.js';
import { settleUncontestedHand } from '../hand/uncontested.js';
import {
  createTableSeries,
  recordCompletedHand,
  startNextTableHand,
} from './table-series.js';

const random = { next: () => 0 };

describe('continuous table series', () => {
  it('increments hand count only after a successful settlement and rotates button', () => {
    let table = createTableSeries('table', [
      { playerId: 'a', seatIndex: 0, stack: 100, status: 'active' },
      { playerId: 'b', seatIndex: 3, stack: 100, status: 'active' },
      { playerId: 'c', seatIndex: 8, stack: 100, status: 'active' },
    ]);
    let hand = startNextTableHand(table, 'h1', 1, random);
    expect(table.completedHands).toBe(0);
    expect(hand.positions.button.playerId).toBe('a');
    hand = applyPreflopAction(hand, 'a', { type: 'fold' });
    hand = applyPreflopAction(hand, 'b', { type: 'fold' });
    table = recordCompletedHand(table, settleUncontestedHand(hand));
    expect(table.completedHands).toBe(1);
    expect(table.lastButtonIndex).toBe(0);

    const next = startNextTableHand(table, 'h2', 1, random);
    expect(next.positions.button.playerId).toBe('b');
  });

  it('skips ineligible and zero-chip seats during the next rotation', () => {
    const table = Object.freeze({
      ...createTableSeries('table', [
        { playerId: 'a', seatIndex: 0, stack: 100, status: 'active' },
        { playerId: 'away', seatIndex: 2, stack: 100, status: 'sitting-out' },
        { playerId: 'broke', seatIndex: 4, stack: 0, status: 'active' },
        { playerId: 'b', seatIndex: 7, stack: 100, status: 'active' },
      ]),
      lastButtonIndex: 0,
    });
    const hand = startNextTableHand(table, 'next', 1, random);
    expect(hand.positions.button.playerId).toBe('b');
    expect(hand.players.map(({ playerId }) => playerId)).toEqual(['a', 'b']);
  });

  it('rejects recording the same completed hand twice', () => {
    let table = createTableSeries('table', [
      { playerId: 'a', seatIndex: 0, stack: 10, status: 'active' },
      { playerId: 'b', seatIndex: 5, stack: 10, status: 'active' },
    ]);
    let hand = startNextTableHand(table, 'same', 1, random);
    hand = applyPreflopAction(hand, 'a', { type: 'fold' });
    const settled = settleUncontestedHand(hand);
    table = recordCompletedHand(table, settled);
    expect(() => recordCompletedHand(table, settled)).toThrow(
      'Hand was already recorded: same',
    );
  });
});
