import { freezeRoom, isHostIdentity, type RoomState } from './room.js';
import {
  validateRoomSettings,
  type RoomSettingsInput,
} from './room-settings.js';

function requireHost(room: RoomState, actorHostId: string): void {
  if (!isHostIdentity(room, actorHostId)) {
    throw new RangeError('Only the host can update room settings');
  }
}

export function updateRoomSettings(
  room: RoomState,
  actorHostId: string,
  input: RoomSettingsInput,
  options: {
    readonly currentSmallBlind?: number;
    readonly completedHands?: number;
  } = {},
): RoomState {
  requireHost(room, actorHostId);
  if (room.phase === 'closed') {
    throw new RangeError('Closed room settings cannot change');
  }

  const settings = validateRoomSettings(input);
  const currentPlayerCount = room.players.filter(
    ({ status }) => !['left', 'removed'].includes(status),
  ).length;
  if (settings.maxPlayers < currentPlayerCount) {
    throw new RangeError(
      'Maximum players cannot be less than the current player count',
    );
  }

  if (room.firstHandStarted) {
    if (
      settings.maxPlayers !== room.settings.maxPlayers ||
      settings.initialChips !== room.settings.initialChips ||
      settings.smallBlind !== room.settings.smallBlind
    ) {
      throw new RangeError(
        'Maximum players, initial chips, and base small blind are locked after the first hand',
      );
    }
  }

  const completedHands = options.completedHands ?? 0;
  if (!Number.isSafeInteger(completedHands) || completedHands < 0) {
    throw new RangeError('Completed hands must be a non-negative safe integer');
  }
  const currentSmallBlind = room.firstHandStarted
    ? (options.currentSmallBlind ?? room.currentSmallBlind)
    : settings.smallBlind;
  if (!Number.isSafeInteger(currentSmallBlind) || currentSmallBlind <= 0) {
    throw new RangeError('Current small blind must be a positive safe integer');
  }
  if (!Number.isSafeInteger(currentSmallBlind * 2)) {
    throw new RangeError('Current big blind must be a safe integer');
  }
  const maxSmallBlind = settings.blindGrowth.maxSmallBlind;
  if (maxSmallBlind !== undefined && maxSmallBlind !== null) {
    if (currentSmallBlind > maxSmallBlind) {
      throw new RangeError(
        'Maximum small blind cannot be less than the current small blind',
      );
    }
  }

  const currentBlindChanged =
    currentSmallBlind !== room.currentSmallBlind || !room.firstHandStarted;
  const previousGrowth = room.settings.blindGrowth;
  const nextGrowth = settings.blindGrowth;
  let nextBlindGrowthAtCompletedHands = room.nextBlindGrowthAtCompletedHands;
  if (!nextGrowth.enabled) {
    nextBlindGrowthAtCompletedHands = null;
  } else if (
    currentBlindChanged ||
    !previousGrowth.enabled ||
    (nextBlindGrowthAtCompletedHands === null &&
      (nextGrowth.maxSmallBlind === undefined ||
        nextGrowth.maxSmallBlind === null ||
        currentSmallBlind < nextGrowth.maxSmallBlind))
  ) {
    nextBlindGrowthAtCompletedHands = completedHands + nextGrowth.intervalHands;
  }

  return freezeRoom({
    ...room,
    settings,
    currentSmallBlind,
    currentBigBlind: currentSmallBlind * 2,
    nextBlindGrowthAtCompletedHands,
    version: room.version + 1,
    players: room.firstHandStarted
      ? room.players
      : room.players.map((player) =>
          ['left', 'removed'].includes(player.status)
            ? player
            : { ...player, chips: settings.initialChips },
        ),
  });
}
