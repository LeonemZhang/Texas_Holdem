import { freezeRoom, type RoomPlayerStatus, type RoomState } from './room.js';

function updateStatus(
  room: RoomState,
  playerId: string,
  status: RoomPlayerStatus,
): RoomState {
  const player = room.players.find(
    (candidate) => candidate.playerId === playerId,
  );
  if (!player) throw new RangeError(`Player is not in the room: ${playerId}`);
  return freezeRoom({
    ...room,
    players: room.players.map((candidate) =>
      candidate.playerId === playerId
        ? { ...candidate, status, lobbyReady: false }
        : candidate,
    ),
    version: room.version + 1,
  });
}

export function leaveRoom(room: RoomState, playerId: string): RoomState {
  if (playerId === room.hostPlayerId) {
    throw new RangeError('The host must close the room instead of leaving');
  }
  return updateStatus(room, playerId, 'left');
}

export function removePlayer(
  room: RoomState,
  actorPlayerId: string,
  targetPlayerId: string,
): RoomState {
  if (actorPlayerId !== room.hostPlayerId) {
    throw new RangeError('Only the host can remove a player');
  }
  if (targetPlayerId === room.hostPlayerId) {
    throw new RangeError('The host cannot remove themselves');
  }
  if (room.phase !== 'lobby' && room.phase !== 'hand-ready') {
    throw new RangeError('Players can only be removed between hands');
  }
  const target = room.players.find(
    ({ playerId }) => playerId === targetPlayerId,
  );
  if (!target || ['left', 'removed'].includes(target.status)) {
    throw new RangeError(`Player cannot be removed: ${targetPlayerId}`);
  }
  return updateStatus(
    room,
    targetPlayerId,
    room.firstHandStarted ? 'removed' : 'left',
  );
}

export function sitOutPlayerForHand(
  room: RoomState,
  playerId: string,
): RoomState {
  return updateStatus(room, playerId, 'sitting-out');
}

export function eliminateZeroChipPlayers(room: RoomState): RoomState {
  if (room.settings.zeroChipPolicy !== 'eliminate') return room;
  const eliminated = room.players.filter(
    ({ chips, status }) =>
      chips === 0 && !['left', 'removed', 'eliminated'].includes(status),
  );
  if (eliminated.length === 0) return room;
  const ids = new Set(eliminated.map(({ playerId }) => playerId));
  return freezeRoom({
    ...room,
    players: room.players.map((player) =>
      ids.has(player.playerId)
        ? { ...player, status: 'eliminated', lobbyReady: false }
        : player,
    ),
    version: room.version + 1,
  });
}
