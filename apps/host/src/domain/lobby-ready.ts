import { freezeRoom, type RoomState } from './room.js';

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
  if (!player || player.status === 'left') {
    throw new RangeError(`Player is not seated: ${playerId}`);
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
  actorPlayerId: string,
): boolean {
  if (
    actorPlayerId !== room.hostPlayerId ||
    room.phase !== 'lobby' ||
    room.firstHandStarted
  ) {
    return false;
  }
  const seated = room.players.filter(({ status }) => status !== 'left');
  return seated.length >= 2 && seated.every(({ lobbyReady }) => lobbyReady);
}
