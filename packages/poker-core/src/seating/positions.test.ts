import { describe, expect, it } from 'vitest';

import {
  actionOrderForStreet,
  assignHeadsUpPositions,
  assignTablePositions,
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

  it('uses the heads-up rule through the unified 2-to-10 entry point', () => {
    const positions = assignTablePositions(active(1, 8), null);
    expect([
      positions.button.index,
      positions.smallBlind.index,
      positions.bigBlind.index,
    ]).toEqual([1, 1, 8]);
  });

  it('assigns standard three-player positions clockwise', () => {
    const positions = assignTablePositions(active(0, 3, 8), 9);
    expect([
      positions.button.index,
      positions.smallBlind.index,
      positions.bigBlind.index,
    ]).toEqual([0, 3, 8]);
  });

  it('supports ten players and wraps position assignment', () => {
    const positions = assignTablePositions(
      active(0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
      7,
    );
    expect([
      positions.button.index,
      positions.smallBlind.index,
      positions.bigBlind.index,
    ]).toEqual([8, 9, 0]);
  });

  it('skips an ineligible middle seat while rotating positions', () => {
    const seats: readonly Seat[] = [
      ...active(0, 2, 6),
      { index: 4, playerId: 'away', status: 'sitting-out' },
    ];
    const positions = assignTablePositions(seats, 0);
    expect([
      positions.button.index,
      positions.smallBlind.index,
      positions.bigBlind.index,
    ]).toEqual([2, 6, 0]);
  });

  it('rejects a table outside the 2-to-10 active-player boundary', () => {
    expect(() => assignTablePositions(active(0), null)).toThrow(
      'A table requires 2 to 10 active seats, received 1',
    );
  });

  it('uses the correct heads-up order before and after the flop', () => {
    const seats = active(2, 7);
    const positions = assignTablePositions(seats, null);
    expect(
      actionOrderForStreet(seats, positions, 'preflop').map(
        ({ index }) => index,
      ),
    ).toEqual([2, 7]);
    expect(
      actionOrderForStreet(seats, positions, 'turn').map(({ index }) => index),
    ).toEqual([7, 2]);
  });

  it('calculates every next actor at three- and ten-player tables', () => {
    const three = active(0, 3, 8);
    const threePositions = assignTablePositions(three, 9);
    expect(
      actionOrderForStreet(three, threePositions, 'preflop').map(
        ({ index }) => index,
      ),
    ).toEqual([0, 3, 8]);
    expect(
      actionOrderForStreet(three, threePositions, 'river').map(
        ({ index }) => index,
      ),
    ).toEqual([3, 8, 0]);

    const ten = active(0, 1, 2, 3, 4, 5, 6, 7, 8, 9);
    const tenPositions = assignTablePositions(ten, 7);
    expect(actionOrderForStreet(ten, tenPositions, 'preflop')[0]?.index).toBe(
      1,
    );
    expect(actionOrderForStreet(ten, tenPositions, 'flop')[0]?.index).toBe(9);
  });

  it('skips a newly ineligible seat in the middle of action order', () => {
    const seats: readonly Seat[] = [
      ...active(0, 2, 6),
      { index: 4, playerId: 'away', status: 'sitting-out' },
    ];
    const positions = assignTablePositions(seats, 0);
    expect(
      actionOrderForStreet(seats, positions, 'flop').map(({ index }) => index),
    ).toEqual([6, 0, 2]);
  });
});
