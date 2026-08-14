import type { RandomSource } from '@texas-holdem/poker-core';

import {
  freezeRoom,
  isHostIdentity,
  type RoomPlayer,
  type RoomState,
} from './room.js';

function requireLobbyHost(room: RoomState, actorHostId: string): void {
  if (
    room.phase !== 'lobby' ||
    room.firstHandStarted ||
    !isHostIdentity(room, actorHostId)
  ) {
    throw new RangeError('Only the host can manage seats in the lobby');
  }
}

function isSeated(player: RoomPlayer): boolean {
  return !['left', 'removed'].includes(player.status);
}

function requireCompactSeats(players: readonly RoomPlayer[]): void {
  const occupiedSeatIndexes = players
    .filter(isSeated)
    .map(({ seatIndex }) => seatIndex)
    .sort((left, right) => left - right);
  if (occupiedSeatIndexes.some((seatIndex, index) => seatIndex !== index)) {
    throw new RangeError('Lobby seats must remain compact');
  }
}

export function reseatPlayer(
  room: RoomState,
  actorHostId: string,
  targetPlayerId: string,
  seatIndex: number,
): RoomState {
  requireLobbyHost(room, actorHostId);
  if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex > 9) {
    throw new RangeError('Seat index must be between 0 and 9');
  }
  const seatedPlayers = room.players.filter(isSeated);
  requireCompactSeats(seatedPlayers);
  const target = room.players.find(
    (player) => player.playerId === targetPlayerId && isSeated(player),
  );
  if (!target) throw new RangeError(`Player is not seated: ${targetPlayerId}`);
  if (target.seatIndex === seatIndex) return room;
  const occupant = seatedPlayers.find(
    (player) => player.seatIndex === seatIndex && isSeated(player),
  );
  if (!occupant) throw new RangeError('Lobby seats must remain compact');
  return freezeRoom({
    ...room,
    players: room.players.map((player) => {
      if (player.playerId === target.playerId) return { ...player, seatIndex };
      if (occupant && player.playerId === occupant.playerId) {
        return { ...player, seatIndex: target.seatIndex };
      }
      return player;
    }),
    version: room.version + 1,
  });
}

function compactOrder(players: readonly RoomPlayer[]): readonly string[] {
  return players
    .filter(isSeated)
    .sort((left, right) => left.seatIndex - right.seatIndex)
    .map(({ playerId }) => playerId);
}

export function shuffleLobbySeats(
  room: RoomState,
  actorHostId: string,
  randomSource: RandomSource,
): RoomState {
  requireLobbyHost(room, actorHostId);
  const currentOrder = compactOrder(room.players);
  const shuffled = [...currentOrder];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const unit = Math.min(Math.max(randomSource.next(), 0), 0.9999999999999999);
    const targetIndex = Math.floor(unit * (index + 1));
    [shuffled[index], shuffled[targetIndex]] = [
      shuffled[targetIndex]!,
      shuffled[index]!,
    ];
  }
  if (
    shuffled.length > 1 &&
    shuffled.every((playerId, index) => playerId === currentOrder[index])
  ) {
    shuffled.push(shuffled.shift()!);
  }
  const nextSeatByPlayerId = new Map(
    shuffled.map((playerId, seatIndex) => [playerId, seatIndex]),
  );
  const changed = room.players.some((player) => {
    const nextSeat = nextSeatByPlayerId.get(player.playerId);
    return nextSeat !== undefined && nextSeat !== player.seatIndex;
  });
  if (!changed) return room;
  return freezeRoom({
    ...room,
    players: room.players.map((player) => {
      const seatIndex = nextSeatByPlayerId.get(player.playerId);
      return seatIndex === undefined ? player : { ...player, seatIndex };
    }),
    version: room.version + 1,
  });
}
