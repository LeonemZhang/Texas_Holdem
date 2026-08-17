import {
  advanceBlindLevel,
  calculateBlindLevel,
  type BlindLevel,
} from '@texas-holdem/poker-core';

import {
  validateRoomSettings,
  type RoomSettings,
  type RoomSettingsInput,
} from './room-settings.js';

export type RoomPhase =
  'lobby' | 'playing' | 'hand-ready' | 'paused' | 'closed';
export type HostParticipation = 'player' | 'service-only';
export type RoomPlayerStatus =
  | 'waiting'
  | 'active'
  | 'sitting-out'
  | 'eliminated'
  | 'left'
  | 'removed'
  | 'disconnected';

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
  /** Stable management identity; deliberately distinct from any player id. */
  readonly hostId: string;
  readonly hostNickname: string;
  readonly hostParticipation: HostParticipation;
  /**
   * Compatibility alias for the pre-ROOMHOST-002 application boundary.
   * It is empty when the host does not participate as a player.
   */
  readonly hostPlayerId: string;
  readonly settings: RoomSettings;
  /** The authoritative level used by the current or next hand. */
  readonly currentSmallBlind: number;
  readonly currentBigBlind: number;
  /** Absolute completed-hand count at which the next growth may occur. */
  readonly nextBlindGrowthAtCompletedHands: number | null;
  readonly phase: RoomPhase;
  readonly players: readonly RoomPlayer[];
  readonly version: number;
  readonly firstHandStarted: boolean;
  readonly voluntarilyRevealedHoleCardPlayerIds: readonly string[];
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
    voluntarilyRevealedHoleCardPlayerIds: Object.freeze([
      ...(room.voluntarilyRevealedHoleCardPlayerIds ?? []),
    ]),
  });
}

export function roomBlindLevel(room: RoomState): BlindLevel {
  return Object.freeze({
    smallBlind: room.currentSmallBlind,
    bigBlind: room.currentBigBlind,
    growthCount: 0,
  });
}

/**
 * Fills the blind state for snapshots written before authoritative blinds
 * existed. New rooms always carry these fields from creation onward.
 */
export function normalizeRoomBlindState(
  room: RoomState,
  completedHands: number,
): RoomState {
  const legacy = room as unknown as RoomState & {
    readonly currentSmallBlind?: number;
    readonly currentBigBlind?: number;
    readonly nextBlindGrowthAtCompletedHands?: number | null;
  };
  const calculated = calculateBlindLevel(
    room.settings.smallBlind,
    completedHands,
    room.settings.blindGrowth,
  );
  const currentSmallBlind = legacy.currentSmallBlind ?? calculated.smallBlind;
  const currentBigBlind = legacy.currentBigBlind ?? currentSmallBlind * 2;
  const nextBlindGrowthAtCompletedHands =
    legacy.nextBlindGrowthAtCompletedHands ??
    (room.settings.blindGrowth.enabled
      ? completedHands + room.settings.blindGrowth.intervalHands
      : null);
  return freezeRoom({
    ...room,
    currentSmallBlind,
    currentBigBlind,
    nextBlindGrowthAtCompletedHands,
  });
}

/**
 * Applies at most one growth event after a completed hand. The next level is
 * calculated from the stored current level, so changing growth settings
 * never replays or rewrites the history of already completed hands.
 */
export function advanceRoomBlindGrowth(
  room: RoomState,
  completedHands: number,
): RoomState {
  if (!Number.isSafeInteger(completedHands) || completedHands < 0) {
    throw new RangeError('Completed hands must be a non-negative safe integer');
  }
  const growth = room.settings.blindGrowth;
  if (!growth.enabled) {
    return room.nextBlindGrowthAtCompletedHands === null
      ? room
      : freezeRoom({
          ...room,
          nextBlindGrowthAtCompletedHands: null,
          version: room.version + 1,
        });
  }
  if (room.nextBlindGrowthAtCompletedHands === null) {
    return freezeRoom({
      ...room,
      nextBlindGrowthAtCompletedHands: completedHands + growth.intervalHands,
      version: room.version + 1,
    });
  }
  if (completedHands < room.nextBlindGrowthAtCompletedHands) return room;

  const next = advanceBlindLevel(room.currentSmallBlind, growth);
  const nextBlindGrowthAtCompletedHands =
    next.smallBlind === room.currentSmallBlind
      ? null
      : completedHands + growth.intervalHands;
  return freezeRoom({
    ...room,
    currentSmallBlind: next.smallBlind,
    currentBigBlind: next.bigBlind,
    nextBlindGrowthAtCompletedHands,
    version: room.version + 1,
  });
}

export function isHostIdentity(room: RoomState, actorId: string): boolean {
  return actorId === room.hostId;
}

export function isHostPlayer(room: RoomState, playerId: string): boolean {
  return room.players.some(
    (player) => player.playerId === playerId && player.roles.includes('host'),
  );
}

export function isVisibleRoomPlayer(
  player: Pick<RoomPlayer, 'status'>,
): boolean {
  return !['left', 'removed'].includes(player.status);
}

export function isVisibleStatisticsPlayer(
  player: Pick<RoomPlayer, 'status'>,
): boolean {
  return player.status !== 'removed';
}

export function resetPlayersToInitialChips(
  room: RoomState,
  playerIds: readonly string[],
): RoomState {
  if (playerIds.length === 0) {
    throw new RangeError('At least one player is required for a chip reset');
  }
  const resetIds = new Set(playerIds);
  return freezeRoom({
    ...room,
    players: room.players.map((player) =>
      resetIds.has(player.playerId)
        ? { ...player, chips: room.settings.initialChips }
        : player,
    ),
    version: room.version + 1,
  });
}

export function createRoom(input: {
  readonly roomId: string;
  /** New callers provide this independently from the optional player id. */
  readonly hostId?: string;
  /** Kept optional so old host-player creation callers remain source compatible. */
  readonly hostPlayerId?: string;
  readonly hostNickname: string;
  readonly hostParticipation?: HostParticipation;
  readonly settings: RoomSettingsInput;
}): RoomState {
  const roomId = assertIdentity(input.roomId, 'Room id');
  const requestedHostPlayerId = input.hostPlayerId?.trim() ?? '';
  const hostId = assertIdentity(
    input.hostId ?? requestedHostPlayerId,
    'Host id',
  );
  const nickname = assertIdentity(input.hostNickname, 'Host nickname');
  const hostParticipation = input.hostParticipation ?? 'player';
  if (hostParticipation !== 'player' && hostParticipation !== 'service-only') {
    throw new RangeError(
      `Unknown host participation: ${String(hostParticipation)}`,
    );
  }
  if (hostParticipation === 'service-only' && requestedHostPlayerId) {
    throw new RangeError('Service-only hosts cannot have a player identity');
  }
  const settings = validateRoomSettings(input.settings);
  const hostPlayerId =
    hostParticipation === 'player'
      ? assertIdentity(requestedHostPlayerId || hostId, 'Host player id')
      : '';
  const players: readonly RoomPlayer[] =
    hostParticipation === 'player'
      ? [
          Object.freeze({
            playerId: hostPlayerId,
            nickname,
            seatIndex: 0,
            chips: settings.initialChips,
            roles: Object.freeze(['host', 'player'] as const),
            status: 'waiting' as const,
            lobbyReady: true,
          }),
        ]
      : [];
  return freezeRoom({
    roomId,
    hostId,
    hostNickname: nickname,
    hostParticipation,
    hostPlayerId,
    settings,
    currentSmallBlind: settings.smallBlind,
    currentBigBlind: settings.bigBlind,
    nextBlindGrowthAtCompletedHands: settings.blindGrowth.enabled
      ? settings.blindGrowth.intervalHands
      : null,
    phase: 'lobby',
    players,
    version: 0,
    firstHandStarted: false,
    voluntarilyRevealedHoleCardPlayerIds: [],
  });
}
