import {
  validateRoomSettings,
  type RoomSettings,
  type RoomSettingsInput,
} from './room-settings.js';

export type RoomPhase =
  'lobby' | 'playing' | 'hand-ready' | 'paused' | 'closed';
export type RoomPlayerStatus =
  'waiting' | 'active' | 'sitting-out' | 'eliminated' | 'left' | 'disconnected';

export interface RoomPlayer {
  readonly playerId: string;
  readonly nickname: string;
  readonly seatIndex: number;
  readonly chips: number;
  readonly roles: readonly ('host' | 'player')[];
  readonly status: RoomPlayerStatus;
  readonly lobbyReady: boolean;
}

export interface RoomState {
  readonly roomId: string;
  readonly hostPlayerId: string;
  readonly settings: RoomSettings;
  readonly phase: RoomPhase;
  readonly players: readonly RoomPlayer[];
  readonly version: number;
  readonly firstHandStarted: boolean;
}

function assertIdentity(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) throw new RangeError(`${label} cannot be empty`);
  return normalized;
}

export function freezeRoom(room: RoomState): RoomState {
  return Object.freeze({
    ...room,
    players: Object.freeze(
      room.players.map((player) =>
        Object.freeze({
          ...player,
          roles: Object.freeze([...player.roles]),
        }),
      ),
    ),
  });
}

export function createRoom(input: {
  readonly roomId: string;
  readonly hostPlayerId: string;
  readonly hostNickname: string;
  readonly settings: RoomSettingsInput;
}): RoomState {
  const roomId = assertIdentity(input.roomId, 'Room id');
  const hostPlayerId = assertIdentity(input.hostPlayerId, 'Host player id');
  const nickname = assertIdentity(input.hostNickname, 'Host nickname');
  const settings = validateRoomSettings(input.settings);
  const host = Object.freeze({
    playerId: hostPlayerId,
    nickname,
    seatIndex: 0,
    chips: settings.initialChips,
    roles: Object.freeze(['host', 'player'] as const),
    status: 'waiting' as const,
    lobbyReady: true,
  });
  return freezeRoom({
    roomId,
    hostPlayerId,
    settings,
    phase: 'lobby',
    players: [host],
    version: 0,
    firstHandStarted: false,
  });
}
