import type { PublicRoomSummary } from '@texas-holdem/lan-discovery';

import type { GameRuntime } from './game-runtime.js';

export function currentDiscoverySummary(
  runtime: GameRuntime,
): PublicRoomSummary | null {
  const roomId = runtime.currentRoomId();
  if (!roomId) return null;
  const room = runtime.rooms.get(roomId);
  if (!room || room.phase === 'closed' || room.phase === 'paused') return null;
  const host = room.players.find(
    ({ playerId }) => playerId === room.hostPlayerId,
  );
  return Object.freeze({
    roomId,
    roomName: room.settings.roomName,
    hostNickname: host?.nickname ?? 'Host',
    playerCount: room.players.filter(
      ({ status }) => !['left', 'eliminated'].includes(status),
    ).length,
    maxPlayers: room.settings.maxPlayers,
    smallBlind: room.settings.smallBlind,
    bigBlind: room.settings.bigBlind,
    phase: room.phase,
  });
}
