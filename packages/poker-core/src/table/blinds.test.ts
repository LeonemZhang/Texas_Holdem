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

  it('supports step growth and caps the small blind', () => {
    expect(
      calculateBlindLevel(5, 30, {
        enabled: true,
        intervalHands: 10,
        mode: 'increment',
        increment: 5,
        maxSmallBlind: 12,
      }),
    ).toEqual({ smallBlind: 12, bigBlind: 24, growthCount: 3 });
  });

  it('caps multiplier growth while keeping the big blind at twice the small blind', () => {
    const level = calculateBlindLevel(5, 30, {
      enabled: true,
      intervalHands: 10,
      mode: 'multiplier',
      multiplier: 2,
      maxSmallBlind: 15,
    });
    expect(level).toEqual({ smallBlind: 15, bigBlind: 30, growthCount: 3 });
  });

  it('rejects a step smaller than the initial small blind', () => {
    expect(() =>
      calculateBlindLevel(5, 10, {
        enabled: true,
        intervalHands: 10,
        mode: 'increment',
        increment: 4,
      }),
    ).toThrow('at least the initial small blind');
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
