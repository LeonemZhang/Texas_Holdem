import { describe, expect, it } from 'vitest';

import {
  eligibleSeatsClockwise,
  nextEligibleSeat,
  type Seat,
} from './seats.js';

const seats: readonly Seat[] = [
  { index: 0, playerId: 'a', status: 'active' },
  { index: 2, playerId: 'b', status: 'eliminated' },
  { index: 4, playerId: 'c', status: 'left' },
  { index: 6, playerId: 'd', status: 'sitting-out' },
  { index: 9, playerId: 'e', status: 'active' },
];

describe('clockwise eligible seat traversal', () => {
  it('visits each active seat once and wraps around', () => {
    expect(
      eligibleSeatsClockwise(seats, 0).map(({ playerId }) => playerId),
    ).toEqual(['e', 'a']);
  });

  it('skips eliminated, left and sitting-out seats', () => {
    expect(nextEligibleSeat(seats, 1)?.playerId).toBe('e');
  });

  it('returns null instead of looping when no seat is eligible', () => {
    expect(
      nextEligibleSeat(
        seats.map((seat) => ({ ...seat, status: 'left' })),
        0,
      ),
    ).toBeNull();
  });

  it('rejects duplicate or out-of-range seats', () => {
    expect(() =>
      eligibleSeatsClockwise(
        [
          { index: 0, playerId: 'a', status: 'active' },
          { index: 0, playerId: 'b', status: 'active' },
        ],
        0,
      ),
    ).toThrow('Duplicate seat index: 0');
    expect(() =>
      eligibleSeatsClockwise(
        [{ index: 10, playerId: 'a', status: 'active' }],
        0,
      ),
    ).toThrow('Invalid seat index: 10');
  });
});
