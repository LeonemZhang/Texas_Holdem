export interface BlindGrowthConfig {
  readonly enabled: boolean;
  readonly intervalHands: number;
  readonly multiplier: number;
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
  if (!Number.isFinite(growth.multiplier) || growth.multiplier <= 1) {
    throw new RangeError('Blind growth multiplier must be greater than one');
  }

  const growthCount = growth.enabled
    ? Math.floor(completedHands / growth.intervalHands)
    : 0;
  let smallBlind = initialSmallBlind;
  for (let index = 0; index < growthCount; index += 1) {
    smallBlind = Math.ceil(smallBlind * growth.multiplier);
    assertPositiveSafeInteger(smallBlind, 'Grown small blind');
  }
  const bigBlind = smallBlind * 2;
  assertPositiveSafeInteger(bigBlind, 'Big blind');
  return Object.freeze({ smallBlind, bigBlind, growthCount });
}
