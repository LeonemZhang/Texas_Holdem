import { describe, expect, it } from 'vitest';

import { calculateBlindLevel } from './blinds.js';

describe('calculateBlindLevel', () => {
  it('supports disabled growth regardless of completed hands', () => {
    expect(
      calculateBlindLevel(5, 1_000, {
        enabled: false,
        intervalHands: 10,
        multiplier: 2,
      }),
    ).toEqual({ smallBlind: 5, bigBlind: 10, growthCount: 0 });
  });

  it.each([5, 10, 20])(
    'grows on the preset %s-hand interval',
    (intervalHands) => {
      expect(
        calculateBlindLevel(1, intervalHands - 1, {
          enabled: true,
          intervalHands,
          multiplier: 2,
        }).smallBlind,
      ).toBe(1);
      expect(
        calculateBlindLevel(1, intervalHands, {
          enabled: true,
          intervalHands,
          multiplier: 2,
        }).smallBlind,
      ).toBe(2);
    },
  );

  it('supports a custom interval and rounds each growth upward', () => {
    expect(
      calculateBlindLevel(3, 14, {
        enabled: true,
        intervalHands: 7,
        multiplier: 1.5,
      }),
    ).toEqual({ smallBlind: 8, bigBlind: 16, growthCount: 2 });
  });

  it('always derives the big blind as exactly twice the small blind', () => {
    const level = calculateBlindLevel(7, 30, {
      enabled: true,
      intervalHands: 10,
      multiplier: 1.25,
    });
    expect(level.bigBlind).toBe(level.smallBlind * 2);
  });
});
