import { freezeRoom, type RoomState } from './room.js';
import {
  validateRoomSettings,
  type RoomSettingsInput,
} from './room-settings.js';

function requireHost(room: RoomState, actorPlayerId: string): void {
  if (actorPlayerId !== room.hostPlayerId) {
    throw new RangeError('Only the host can update room settings');
  }
}

export function updateRoomSettings(
  room: RoomState,
  actorPlayerId: string,
  input: RoomSettingsInput,
): RoomState {
  requireHost(room, actorPlayerId);
  if (room.phase !== 'lobby' || room.firstHandStarted) {
    throw new RangeError('Room settings can only change before the first hand');
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

  return freezeRoom({
    ...room,
    settings,
    version: room.version + 1,
    players: room.players.map((player) =>
      ['left', 'removed'].includes(player.status)
        ? player
        : { ...player, chips: settings.initialChips },
    ),
  });
}
