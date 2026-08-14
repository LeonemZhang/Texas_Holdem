export type BlindGrowthMode = 'multiplier' | 'increment';

export interface BlindGrowthConfig {
  readonly enabled: boolean;
  readonly intervalHands: number;
  readonly mode?: BlindGrowthMode | undefined;
  readonly multiplier?: number | undefined;
  readonly increment?: number | undefined;
  readonly maxSmallBlind?: number | null | undefined;
}

export interface BlindLevel {
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly growthCount: number;
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
}

export function calculateBlindLevel(
  initialSmallBlind: number,
  completedHands: number,
  growth: BlindGrowthConfig,
): BlindLevel {
  assertPositiveSafeInteger(initialSmallBlind, 'Initial small blind');
  if (!Number.isSafeInteger(completedHands) || completedHands < 0) {
    throw new RangeError('Completed hands must be a non-negative safe integer');
  }
  assertPositiveSafeInteger(growth.intervalHands, 'Blind growth interval');
  const mode = growth.mode ?? 'multiplier';
  if (mode !== 'multiplier' && mode !== 'increment') {
    throw new RangeError(`Unknown blind growth mode: ${String(mode)}`);
  }
  if (mode === 'multiplier') {
    if (!Number.isFinite(growth.multiplier) || growth.multiplier! <= 1) {
      throw new RangeError('Blind growth multiplier must be greater than one');
    }
  } else {
    if (growth.increment === undefined) {
      throw new RangeError('Blind growth increment is required');
    }
    assertPositiveSafeInteger(growth.increment, 'Blind growth increment');
    if (growth.increment < initialSmallBlind) {
      throw new RangeError(
        'Blind growth increment must be at least the initial small blind',
      );
    }
  }

  const maxSmallBlind = growth.maxSmallBlind ?? null;
  if (maxSmallBlind !== null) {
    assertPositiveSafeInteger(maxSmallBlind, 'Maximum small blind');
    if (maxSmallBlind < initialSmallBlind) {
      throw new RangeError(
        'Maximum small blind must be at least the initial small blind',
      );
    }
    assertPositiveSafeInteger(maxSmallBlind * 2, 'Maximum big blind');
  }

  const growthCount = growth.enabled
    ? Math.floor(completedHands / growth.intervalHands)
    : 0;
  let smallBlind = initialSmallBlind;
  for (let index = 0; index < growthCount; index += 1) {
    if (maxSmallBlind !== null && smallBlind >= maxSmallBlind) break;
    if (
      maxSmallBlind !== null &&
      ((mode === 'increment' &&
        smallBlind > maxSmallBlind - growth.increment!) ||
        (mode === 'multiplier' &&
          smallBlind > maxSmallBlind / growth.multiplier!))
    ) {
      smallBlind = maxSmallBlind;
      continue;
    }
    smallBlind =
      mode === 'increment'
        ? smallBlind + growth.increment!
        : Math.ceil(smallBlind * growth.multiplier!);
    assertPositiveSafeInteger(smallBlind, 'Grown small blind');
    if (maxSmallBlind !== null)
      smallBlind = Math.min(smallBlind, maxSmallBlind);
  }
  const bigBlind = smallBlind * 2;
  assertPositiveSafeInteger(bigBlind, 'Big blind');
  return Object.freeze({ smallBlind, bigBlind, growthCount });
}

/**
 * Advances one blind-growth event from the authoritative current level.
 *
 * This intentionally does not look at completed-hand history. Once a hand
 * has started, the host's current blind level is the source of truth and
 * changing the growth configuration must not recalculate past levels.
 */
export function advanceBlindLevel(
  currentSmallBlind: number,
  growth: BlindGrowthConfig,
): BlindLevel {
  assertPositiveSafeInteger(currentSmallBlind, 'Current small blind');
  assertPositiveSafeInteger(growth.intervalHands, 'Blind growth interval');
  const mode = growth.mode ?? 'multiplier';
  if (mode !== 'multiplier' && mode !== 'increment') {
    throw new RangeError(`Unknown blind growth mode: ${String(mode)}`);
  }
  if (mode === 'multiplier') {
    if (!Number.isFinite(growth.multiplier) || growth.multiplier! <= 1) {
      throw new RangeError('Blind growth multiplier must be greater than one');
    }
  } else {
    if (growth.increment === undefined) {
      throw new RangeError('Blind growth increment is required');
    }
    assertPositiveSafeInteger(growth.increment, 'Blind growth increment');
  }

  const maxSmallBlind = growth.maxSmallBlind ?? null;
  if (maxSmallBlind !== null) {
    assertPositiveSafeInteger(maxSmallBlind, 'Maximum small blind');
    if (maxSmallBlind < currentSmallBlind) {
      throw new RangeError(
        'Maximum small blind cannot be less than the current small blind',
      );
    }
    assertPositiveSafeInteger(maxSmallBlind * 2, 'Maximum big blind');
  }

  if (
    !growth.enabled ||
    (maxSmallBlind !== null && currentSmallBlind >= maxSmallBlind)
  ) {
    return Object.freeze({
      smallBlind: currentSmallBlind,
      bigBlind: currentSmallBlind * 2,
      growthCount: 0,
    });
  }

  let smallBlind =
    mode === 'increment'
      ? currentSmallBlind + growth.increment!
      : Math.ceil(currentSmallBlind * growth.multiplier!);
  assertPositiveSafeInteger(smallBlind, 'Grown small blind');
  if (maxSmallBlind !== null) smallBlind = Math.min(smallBlind, maxSmallBlind);
  assertPositiveSafeInteger(smallBlind * 2, 'Grown big blind');
  return Object.freeze({
    smallBlind,
    bigBlind: smallBlind * 2,
    growthCount: smallBlind === currentSmallBlind ? 0 : 1,
  });
}
