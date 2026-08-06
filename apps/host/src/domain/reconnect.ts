import { freezeRoom, type RoomPlayerStatus, type RoomState } from './room.js';

export type ResumeStatus = Exclude<
  RoomPlayerStatus,
  'disconnected' | 'removed'
>;

export interface ReconnectIdentity {
  readonly playerId: string;
  readonly token: string;
  readonly resumeStatus: ResumeStatus;
}

export interface ReconnectRegistry {
  readonly identities: readonly ReconnectIdentity[];
}

function freezeRegistry(registry: ReconnectRegistry): ReconnectRegistry {
  return Object.freeze({
    identities: Object.freeze(
      registry.identities.map((identity) => Object.freeze({ ...identity })),
    ),
  });
}

export function createReconnectRegistry(
  room: RoomState,
  tokens: Readonly<Record<string, string>>,
): ReconnectRegistry {
  const seen = new Set<string>();
  return freezeRegistry({
    identities: room.players.flatMap((player) => {
      if (player.status === 'removed') return [];
      const token = tokens[player.playerId]?.trim();
      if (!token || seen.has(token)) {
        throw new RangeError(
          `Reconnect token must be non-empty and unique for ${player.playerId}`,
        );
      }
      seen.add(token);
      const resumeStatus: ResumeStatus =
        player.status === 'disconnected' ? 'waiting' : player.status;
      return [{ playerId: player.playerId, token, resumeStatus }];
    }),
  });
}

export function markPlayerDisconnected(
  room: RoomState,
  registry: ReconnectRegistry,
  playerId: string,
): { readonly room: RoomState; readonly registry: ReconnectRegistry } {
  const player = room.players.find(
    (candidate) => candidate.playerId === playerId,
  );
  const identity = registry.identities.find(
    (candidate) => candidate.playerId === playerId,
  );
  if (!player || !identity)
    throw new RangeError(`Reconnect identity not found: ${playerId}`);
  if (
    player.status === 'left' ||
    player.status === 'removed' ||
    player.status === 'eliminated'
  ) {
    throw new RangeError(
      'A non-participating player cannot become disconnected',
    );
  }
  const resumeStatus: ResumeStatus =
    player.status === 'disconnected' ? identity.resumeStatus : player.status;
  return Object.freeze({
    room: freezeRoom({
      ...room,
      players: room.players.map((candidate) =>
        candidate.playerId === playerId
          ? { ...candidate, status: 'disconnected' }
          : candidate,
      ),
      version: room.version + 1,
    }),
    registry: freezeRegistry({
      identities: registry.identities.map((candidate) =>
        candidate.playerId === playerId
          ? { ...candidate, resumeStatus }
          : candidate,
      ),
    }),
  });
}

export function reconnectPlayer(
  room: RoomState,
  registry: ReconnectRegistry,
  token: string,
): RoomState {
  const identity = registry.identities.find(
    (candidate) => candidate.token === token,
  );
  if (!identity) throw new RangeError('Invalid reconnect token');
  const player = room.players.find(
    (candidate) => candidate.playerId === identity.playerId,
  );
  if (!player || player.status !== 'disconnected') {
    throw new RangeError('Player is not waiting for reconnection');
  }
  return freezeRoom({
    ...room,
    players: room.players.map((candidate) =>
      candidate.playerId === identity.playerId
        ? { ...candidate, status: identity.resumeStatus }
        : candidate,
    ),
    version: room.version + 1,
  });
}

export function resumeLeftPlayer(
  room: RoomState,
  playerId: string,
  nickname?: string,
): RoomState {
  if (room.phase === 'closed') throw new RangeError('Room is closed');
  const player = room.players.find(
    (candidate) => candidate.playerId === playerId,
  );
  if (!player || player.status !== 'left') {
    throw new RangeError('Player is not waiting to resume');
  }
  if (nickname !== undefined && room.phase !== 'lobby') {
    throw new RangeError(
      'Nickname can only be changed while recovering to the lobby',
    );
  }
  const nextNickname =
    nickname === undefined ? player.nickname : nickname.trim();
  if (!nextNickname) throw new RangeError('Nickname cannot be empty');
  if (
    room.players.some(
      (candidate) =>
        candidate.playerId !== playerId &&
        candidate.nickname.toLocaleLowerCase() ===
          nextNickname.toLocaleLowerCase(),
    )
  ) {
    throw new RangeError(`Nickname already exists: ${nextNickname}`);
  }
  return freezeRoom({
    ...room,
    players: room.players.map((candidate) =>
      candidate.playerId === playerId
        ? {
            ...candidate,
            nickname: nextNickname,
            status: room.phase === 'lobby' ? 'waiting' : 'sitting-out',
            lobbyReady: false,
          }
        : candidate,
    ),
    version: room.version + 1,
  });
}
