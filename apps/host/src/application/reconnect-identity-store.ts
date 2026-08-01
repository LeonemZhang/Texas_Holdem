import {
  reconnectPlayer,
  type ReconnectRegistry,
  type ResumeStatus,
} from '../domain/reconnect.js';
import type { RoomState } from '../domain/room.js';

export interface PersistedReconnectIdentity {
  readonly playerId: string;
  readonly resumeStatus: ResumeStatus;
}

export interface ReconnectIdentityStorePort {
  authenticate(
    roomId: string,
    token: string,
  ): PersistedReconnectIdentity | null;
}

export function restorePlayerFromPersistedIdentity(
  room: RoomState,
  identities: ReconnectIdentityStorePort,
  token: string,
): RoomState {
  const identity = identities.authenticate(room.roomId, token);
  if (!identity) throw new RangeError('Invalid reconnect token');
  const transientRegistry: ReconnectRegistry = Object.freeze({
    identities: Object.freeze([
      Object.freeze({
        playerId: identity.playerId,
        token,
        resumeStatus: identity.resumeStatus,
      }),
    ]),
  });
  return reconnectPlayer(room, transientRegistry, token);
}
