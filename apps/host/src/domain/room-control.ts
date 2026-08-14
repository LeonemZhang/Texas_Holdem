import {
  freezeRoom,
  isHostIdentity,
  type RoomPhase,
  type RoomState,
} from './room.js';

type PausablePhase = Extract<RoomPhase, 'playing' | 'hand-ready'>;

export interface PausedRoomState {
  readonly room: RoomState;
  readonly pausedFrom: PausablePhase;
}

export interface NormalRoomClosedEvent {
  readonly type: 'room.closed';
  readonly roomId: string;
  readonly actorPlayerId: string;
  readonly normal: true;
}

function requireHost(room: RoomState, actorHostId: string): void {
  if (!isHostIdentity(room, actorHostId)) {
    throw new RangeError('Only the host can control the room');
  }
}

export function pauseRoom(
  room: RoomState,
  actorHostId: string,
): PausedRoomState {
  requireHost(room, actorHostId);
  if (room.phase !== 'playing' && room.phase !== 'hand-ready') {
    throw new RangeError(`Room cannot pause from phase: ${room.phase}`);
  }
  return Object.freeze({
    room: freezeRoom({
      ...room,
      phase: 'paused',
      version: room.version + 1,
    }),
    pausedFrom: room.phase,
  });
}

export function resumeRoom(
  paused: PausedRoomState,
  actorHostId: string,
): RoomState {
  requireHost(paused.room, actorHostId);
  if (paused.room.phase !== 'paused') {
    throw new RangeError('Room is not paused');
  }
  return freezeRoom({
    ...paused.room,
    phase: paused.pausedFrom,
    version: paused.room.version + 1,
  });
}

export function closeRoom(
  room: RoomState,
  actorHostId: string,
): {
  readonly room: RoomState;
  readonly event: NormalRoomClosedEvent;
} {
  requireHost(room, actorHostId);
  if (room.phase === 'closed') throw new RangeError('Room is already closed');
  return Object.freeze({
    room: freezeRoom({
      ...room,
      phase: 'closed',
      version: room.version + 1,
    }),
    event: Object.freeze({
      type: 'room.closed',
      roomId: room.roomId,
      actorPlayerId: actorHostId,
      normal: true,
    }),
  });
}
