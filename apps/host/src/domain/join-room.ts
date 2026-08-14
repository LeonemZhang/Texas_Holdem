import { freezeRoom, type RoomState } from './room.js';

const MAX_NICKNAME_LENGTH = 40;
const RECOMMENDED_NICKNAMES = Object.freeze([
  'Alice',
  'Bob',
  'Carol',
  'Dave',
  'Eve',
  'Frank',
  'Grace',
  'Heidi',
  'Ivan',
  'Judy',
] as const);

function sameNickname(left: string, right: string): boolean {
  return left.toLocaleLowerCase() === right.toLocaleLowerCase();
}

export function isNicknameTaken(
  room: RoomState,
  nickname: string,
  exceptPlayerId?: string,
): boolean {
  return room.players.some(
    (player) =>
      player.playerId !== exceptPlayerId &&
      sameNickname(player.nickname, nickname),
  );
}

export function suggestAvailableNickname(
  room: RoomState,
  nickname: string,
): string {
  const normalized = nickname.trim();
  if (!normalized) throw new RangeError('Nickname cannot be empty');
  if (normalized.length > MAX_NICKNAME_LENGTH) {
    throw new RangeError('Nickname is too long');
  }
  if (!isNicknameTaken(room, normalized)) return normalized;

  const currentIndex = RECOMMENDED_NICKNAMES.findIndex((candidate) =>
    sameNickname(candidate, normalized),
  );
  const candidates = [
    ...RECOMMENDED_NICKNAMES.slice(currentIndex + 1),
    ...RECOMMENDED_NICKNAMES.slice(0, currentIndex + 1),
  ];
  for (const candidate of candidates) {
    if (!isNicknameTaken(room, candidate)) return candidate;
  }
  throw new RangeError('No recommended nickname is available');
}

export function canAcceptNewPlayer(room: RoomState): boolean {
  if (!room.firstHandStarted) return room.phase === 'lobby';
  return (
    room.phase === 'playing' ||
    room.phase === 'hand-ready' ||
    room.phase === 'paused'
  );
}

export function joinRoom(
  room: RoomState,
  input: { readonly playerId: string; readonly nickname: string },
): RoomState {
  if (!canAcceptNewPlayer(room)) {
    throw new RangeError('New players cannot join in the current room phase');
  }
  const playerId = input.playerId.trim();
  const nickname = input.nickname.trim();
  if (!playerId) throw new RangeError('Player id cannot be empty');
  if (!nickname) throw new RangeError('Nickname cannot be empty');
  if (room.players.some((player) => player.playerId === playerId)) {
    throw new RangeError(`Player id already exists: ${playerId}`);
  }
  if (room.hostId === playerId) {
    throw new RangeError(`Player id conflicts with host id: ${playerId}`);
  }
  if (isNicknameTaken(room, nickname)) {
    throw new RangeError(`Nickname already exists: ${nickname}`);
  }
  // `players` is the complete actual-player collection. A service-only host
  // has no placeholder entry, so it is naturally excluded from this count and
  // from seat allocation.
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
  const seatIndex = Array.from({ length: 10 }, (_, index) => index).find(
    (index) => !occupied.has(index),
  );
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
