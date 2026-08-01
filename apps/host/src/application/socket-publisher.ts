import {
  DomainEventSchema,
  PlayerSnapshotSchema,
  type DomainEvent,
  type PlayerSnapshot,
} from '@texas-holdem/protocol';
import type { Server as SocketIOServer } from 'socket.io';

function channelPart(value: string): string {
  return encodeURIComponent(value);
}

export function publicRoomChannel(roomId: string): string {
  return `room:${channelPart(roomId)}`;
}

export function privatePlayerChannel(roomId: string, playerId: string): string {
  return `${publicRoomChannel(roomId)}:player:${channelPart(playerId)}`;
}

export class SocketPublisher {
  constructor(private readonly io: SocketIOServer) {}

  publishEvent(event: DomainEvent): void {
    const parsed = DomainEventSchema.parse(event);
    this.io.to(publicRoomChannel(parsed.roomId)).emit('event:domain', parsed);
  }

  publishSnapshot(snapshot: PlayerSnapshot): void {
    const parsed = PlayerSnapshotSchema.parse(snapshot);
    this.io
      .to(privatePlayerChannel(parsed.roomId, parsed.playerId))
      .emit('state:snapshot', parsed);
  }
}
