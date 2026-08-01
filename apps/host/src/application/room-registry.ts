import { freezeRoom, type RoomState } from '../domain/room.js';

export interface RoomRepository {
  get(roomId: string): RoomState | null;
  save(room: RoomState): void;
  listRoomIds(): readonly string[];
}

export class InMemoryRoomRegistry implements RoomRepository {
  readonly #rooms = new Map<string, RoomState>();

  get(roomId: string): RoomState | null {
    const room = this.#rooms.get(roomId);
    return room ? freezeRoom(room) : null;
  }

  save(room: RoomState): void {
    this.#rooms.set(room.roomId, freezeRoom(room));
  }

  listRoomIds(): readonly string[] {
    return Object.freeze([...this.#rooms.keys()].sort());
  }
}
