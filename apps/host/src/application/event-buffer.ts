import { DomainEventSchema, type DomainEvent } from '@texas-holdem/protocol';

export type UnsequencedDomainEvent = DomainEvent extends infer Event
  ? Event extends DomainEvent
    ? Omit<Event, 'sequence'>
    : never
  : never;

export interface EventReadResult {
  readonly continuous: boolean;
  readonly oldestSequence: number | null;
  readonly latestSequence: number;
  readonly events: readonly DomainEvent[];
}

interface RoomEventBuffer {
  nextSequence: number;
  events: DomainEvent[];
}

export class InMemoryEventBuffer {
  readonly #rooms = new Map<string, RoomEventBuffer>();

  constructor(private readonly capacityPerRoom = 512) {
    if (!Number.isSafeInteger(capacityPerRoom) || capacityPerRoom <= 0) {
      throw new RangeError('Event buffer capacity must be a positive integer');
    }
  }

  append(events: readonly UnsequencedDomainEvent[]): readonly DomainEvent[] {
    if (events.length === 0) return Object.freeze([]);
    const roomId = events[0]?.roomId;
    if (!roomId || events.some((event) => event.roomId !== roomId)) {
      throw new RangeError('An event batch must belong to one room');
    }
    const room = this.#rooms.get(roomId) ?? {
      nextSequence: 1,
      events: [],
    };
    const appended = events.map((event) => {
      const sequenced = DomainEventSchema.parse({
        ...event,
        sequence: room.nextSequence,
      });
      room.nextSequence += 1;
      room.events.push(sequenced);
      return sequenced;
    });
    if (room.events.length > this.capacityPerRoom) {
      room.events.splice(0, room.events.length - this.capacityPerRoom);
    }
    this.#rooms.set(roomId, room);
    return Object.freeze(appended);
  }

  readAfter(roomId: string, offset: number): EventReadResult {
    if (!roomId.trim()) throw new RangeError('Room id cannot be empty');
    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new RangeError('Event offset must be a non-negative integer');
    }
    const room = this.#rooms.get(roomId);
    if (!room) {
      return Object.freeze({
        continuous: offset === 0,
        oldestSequence: null,
        latestSequence: 0,
        events: Object.freeze([]),
      });
    }
    const latestSequence = room.nextSequence - 1;
    const oldestSequence = room.events[0]?.sequence ?? null;
    const continuous =
      offset <= latestSequence &&
      (oldestSequence === null || offset >= oldestSequence - 1);
    const events = continuous
      ? room.events.filter((event) => event.sequence > offset)
      : [];
    return Object.freeze({
      continuous,
      oldestSequence,
      latestSequence,
      events: Object.freeze(events),
    });
  }
}
