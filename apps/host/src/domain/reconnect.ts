import { freezeRoom, type RoomPlayerStatus, type RoomState } from './room.js';

type ResumeStatus = Exclude<RoomPlayerStatus, 'disconnected'>;

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
    identities: room.players.map((player) => {
      const token = tokens[player.playerId]?.trim();
      if (!token || seen.has(token)) {
        throw new RangeError(
          `Reconnect token must be non-empty and unique for ${player.playerId}`,
        );
      }
      seen.add(token);
      const resumeStatus: ResumeStatus =
        player.status === 'disconnected' ? 'waiting' : player.status;
      return { playerId: player.playerId, token, resumeStatus };
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
  if (['left', 'eliminated'].includes(player.status)) {
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
