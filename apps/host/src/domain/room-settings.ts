export const PRESET_SMALL_BLINDS = [1, 5, 10, 25, 50, 100] as const;
export type PresetSmallBlind = (typeof PRESET_SMALL_BLINDS)[number];

export type BlindSetting =
  | { readonly kind: 'preset'; readonly smallBlind: PresetSmallBlind }
  | { readonly kind: 'custom'; readonly smallBlind: number };

export type ZeroChipPolicy = 'request-chips' | 'eliminate';

export interface BlindGrowthConfig {
  readonly enabled: boolean;
  readonly intervalHands: number;
  readonly mode?: 'multiplier' | 'increment' | undefined;
  readonly multiplier?: number | undefined;
  readonly increment?: number | undefined;
  readonly maxSmallBlind?: number | null | undefined;
}

export interface RoomSettingsInput {
  readonly roomName: string;
  readonly maxPlayers: number;
  readonly initialChips: number;
  readonly blind: BlindSetting;
  readonly actionTimeoutSeconds: number;
  readonly handReadyTimeoutSeconds: number;
  readonly blindGrowth: BlindGrowthConfig;
  readonly zeroChipPolicy: ZeroChipPolicy;
}

export interface RoomSettings extends Omit<RoomSettingsInput, 'roomName'> {
  readonly roomName: string;
  readonly smallBlind: number;
  readonly bigBlind: number;
}

function assertPositiveSafeInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
}

export function validateRoomSettings(input: RoomSettingsInput): RoomSettings {
  const roomName = input.roomName.trim();
  if (!roomName) throw new RangeError('Room name cannot be empty');
  if (
    !Number.isSafeInteger(input.maxPlayers) ||
    input.maxPlayers < 2 ||
    input.maxPlayers > 10
  ) {
    throw new RangeError('Maximum players must be between 2 and 10');
  }
  assertPositiveSafeInteger(input.initialChips, 'Initial chips');
  assertPositiveSafeInteger(input.blind.smallBlind, 'Small blind');
  if (
    input.blind.kind === 'preset' &&
    !PRESET_SMALL_BLINDS.includes(input.blind.smallBlind)
  ) {
    throw new RangeError('Unknown blind preset');
  }
  const bigBlind = input.blind.smallBlind * 2;
  assertPositiveSafeInteger(bigBlind, 'Big blind');
  assertPositiveSafeInteger(input.actionTimeoutSeconds, 'Action timeout');
  assertPositiveSafeInteger(
    input.handReadyTimeoutSeconds,
    'Hand-ready timeout',
  );
  assertPositiveSafeInteger(
    input.blindGrowth.intervalHands,
    'Blind growth interval',
  );
  const growthMode = input.blindGrowth.mode ?? 'multiplier';
  if (growthMode !== 'multiplier' && growthMode !== 'increment') {
    throw new RangeError(`Unknown blind growth mode: ${String(growthMode)}`);
  }
  if (growthMode === 'multiplier') {
    if (
      !Number.isFinite(input.blindGrowth.multiplier) ||
      input.blindGrowth.multiplier! <= 1
    ) {
      throw new RangeError('Blind growth multiplier must be greater than one');
    }
  } else {
    if (input.blindGrowth.increment === undefined) {
      throw new RangeError('Blind growth increment is required');
    }
    assertPositiveSafeInteger(
      input.blindGrowth.increment,
      'Blind growth increment',
    );
    if (input.blindGrowth.increment < input.blind.smallBlind) {
      throw new RangeError(
        'Blind growth increment must be at least the small blind',
      );
    }
  }
  if (input.blindGrowth.increment !== undefined) {
    assertPositiveSafeInteger(
      input.blindGrowth.increment,
      'Blind growth increment',
    );
  }
  const maxSmallBlind = input.blindGrowth.maxSmallBlind;
  if (maxSmallBlind !== undefined && maxSmallBlind !== null) {
    assertPositiveSafeInteger(maxSmallBlind, 'Maximum small blind');
    if (maxSmallBlind < input.blind.smallBlind) {
      throw new RangeError(
        'Maximum small blind must be at least the small blind',
      );
    }
    assertPositiveSafeInteger(maxSmallBlind * 2, 'Maximum big blind');
  }
  if (!['request-chips', 'eliminate'].includes(input.zeroChipPolicy)) {
    throw new RangeError('Unknown zero-chip policy');
  }

  return Object.freeze({
    ...input,
    roomName,
    blind: Object.freeze({ ...input.blind }),
    blindGrowth: Object.freeze({ ...input.blindGrowth }),
    smallBlind: input.blind.smallBlind,
    bigBlind,
  });
}
