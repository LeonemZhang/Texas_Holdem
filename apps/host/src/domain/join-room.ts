import { freezeRoom, type RoomState } from './room.js';

export function joinRoom(
  room: RoomState,
  input: { readonly playerId: string; readonly nickname: string },
): RoomState {
  if (room.phase !== 'lobby' || room.firstHandStarted) {
    throw new RangeError('New players cannot join after the first hand starts');
  }
  const playerId = input.playerId.trim();
  const nickname = input.nickname.trim();
  if (!playerId) throw new RangeError('Player id cannot be empty');
  if (!nickname) throw new RangeError('Nickname cannot be empty');
  if (room.players.some((player) => player.playerId === playerId)) {
    throw new RangeError(`Player id already exists: ${playerId}`);
  }
  if (
    room.players.some(
      (player) =>
        player.nickname.toLocaleLowerCase() === nickname.toLocaleLowerCase(),
    )
  ) {
    throw new RangeError(`Nickname already exists: ${nickname}`);
  }
  const seatedCount = room.players.filter(
    ({ status }) => !['left', 'removed'].includes(status),
  ).length;
  if (seatedCount >= room.settings.maxPlayers) {
    throw new RangeError('Room is full');
  }
  const occupied = new Set(
    room.players
      .filter(({ status }) => !['left', 'removed'].includes(status))
      .map(({ seatIndex }) => seatIndex),
  );
  const seatIndex = Array.from(
    { length: room.settings.maxPlayers },
    (_, index) => index,
  ).find((index) => !occupied.has(index));
  if (seatIndex === undefined) throw new RangeError('Room has no free seat');

  return freezeRoom({
    ...room,
    players: [
      ...room.players,
      {
        playerId,
        nickname,
        seatIndex,
        chips: room.settings.initialChips,
        roles: ['player'],
        status: 'waiting',
        lobbyReady: false,
      },
    ],
    version: room.version + 1,
  });
}
