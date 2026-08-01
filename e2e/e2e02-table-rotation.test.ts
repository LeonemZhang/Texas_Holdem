import { describe, expect, it } from 'vitest';

import {
  actionOrderForStreet,
  assignTablePositions,
  type Seat,
} from '../packages/poker-core/src/index.js';

const seat = (index: number, status: Seat['status'] = 'active'): Seat => ({
  index,
  playerId: `p${index}`,
  status,
});

describe('LUNA-E2E02 three and ten player rotation', () => {
  it('rotates button and blinds clockwise on a three-player table', () => {
    const seats = [seat(0), seat(3), seat(7)];
    const first = assignTablePositions(seats, null);
    expect(first).toMatchObject({
      button: { playerId: 'p0' },
      smallBlind: { playerId: 'p3' },
      bigBlind: { playerId: 'p7' },
    });
    expect(
      actionOrderForStreet(seats, first, 'preflop').map(
        ({ playerId }) => playerId,
      ),
    ).toEqual(['p0', 'p3', 'p7']);

    const second = assignTablePositions(seats, first.button.index);
    expect(second).toMatchObject({
      button: { playerId: 'p3' },
      smallBlind: { playerId: 'p7' },
      bigBlind: { playerId: 'p0' },
    });
  });

  it('supports ten seats and skips sitting-out, left, and eliminated seats', () => {
    const fullTable = Array.from({ length: 10 }, (_, index) => seat(index));
    const first = assignTablePositions(fullTable, null);
    expect(first.button.playerId).toBe('p0');
    expect(first.smallBlind.playerId).toBe('p1');
    expect(first.bigBlind.playerId).toBe('p2');

    const nextSeats = fullTable.map((candidate) =>
      candidate.index === 1
        ? seat(1, 'sitting-out')
        : candidate.index === 2
          ? seat(2, 'left')
          : candidate.index === 7
            ? seat(7, 'eliminated')
            : candidate,
    );
    const next = assignTablePositions(nextSeats, first.button.index);
    expect(next).toMatchObject({
      button: { playerId: 'p3' },
      smallBlind: { playerId: 'p4' },
      bigBlind: { playerId: 'p5' },
    });
    const order = actionOrderForStreet(nextSeats, next, 'preflop').map(
      ({ playerId }) => playerId,
    );
    expect(order[0]).toBe('p6');
    expect(order).not.toEqual(expect.arrayContaining(['p1', 'p2', 'p7']));
    expect(order).toHaveLength(7);
  });
});
