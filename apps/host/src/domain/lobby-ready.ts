import { freezeRoom, isHostIdentity, type RoomState } from './room.js';

export function setLobbyReady(
  room: RoomState,
  playerId: string,
  ready: boolean,
): RoomState {
  if (room.phase !== 'lobby' || room.firstHandStarted) {
    throw new RangeError(
      'Lobby readiness is only available before the first hand',
    );
  }
  const player = room.players.find(
    (candidate) => candidate.playerId === playerId,
  );
  if (!player || ['left', 'removed'].includes(player.status)) {
    throw new RangeError(`Player is not seated: ${playerId}`);
  }
  if (
    room.hostParticipation === 'player' &&
    player.playerId === room.hostPlayerId &&
    !ready
  ) {
    throw new RangeError('Host remains ready before the first hand');
  }
  if (player.lobbyReady === ready) return room;
  return freezeRoom({
    ...room,
    players: room.players.map((candidate) =>
      candidate.playerId === playerId
        ? { ...candidate, lobbyReady: ready }
        : candidate,
    ),
    version: room.version + 1,
  });
}

export function canHostStartFirstHand(
  room: RoomState,
  actorHostId: string,
): boolean {
  if (
    !isHostIdentity(room, actorHostId) ||
    room.phase !== 'lobby' ||
    room.firstHandStarted
  ) {
    return false;
  }
  const seated = room.players.filter(
    ({ status }) => !['left', 'removed'].includes(status),
  );
  return seated.length >= 2 && seated.every(({ lobbyReady }) => lobbyReady);
}
