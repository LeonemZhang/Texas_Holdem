import { randomBytes, randomUUID } from 'node:crypto';

import {
  BettingCommandSchema,
  PROTOCOL_VERSION,
  type CommandResponse,
  type CreateRoomSessionRequest,
  type JoinRoomSessionRequest,
  type PlayerSnapshot,
  type RoomSessionResponse,
} from '@texas-holdem/protocol';

import { GameCommandHandler } from './game-command-handler.js';
import {
  CommandDispatcher,
  type ClientCommand,
  type CommandHandlerResult,
} from './command-dispatcher.js';
import { InMemoryEventBuffer } from './event-buffer.js';
import { ReconnectSynchronizer } from './reconnect-synchronizer.js';
import { RoomCommandHandler } from './room-command-handler.js';
import { InMemoryRoomRegistry } from './room-registry.js';
import { InMemorySessionAuthenticator } from './session-authenticator.js';
import { projectPlayerSnapshot } from './snapshot-projector.js';

export interface RoomSessionBootstrapService {
  currentRoomId(): string | null;
  create(
    request: CreateRoomSessionRequest,
    baseJoinUrl: string,
  ): RoomSessionResponse;
  join(
    roomId: string,
    request: JoinRoomSessionRequest,
    baseJoinUrl: string,
  ): RoomSessionResponse;
}

export class GameRuntime implements RoomSessionBootstrapService {
  readonly rooms = new InMemoryRoomRegistry();
  readonly sessions = new InMemorySessionAuthenticator();
  readonly events = new InMemoryEventBuffer();
  readonly reconnect = new ReconnectSynchronizer(
    this.events,
    (roomId, playerId) => this.snapshot(roomId, playerId),
  );

  readonly #roomHandler = new RoomCommandHandler(this.rooms, {
    next: () => Math.random(),
  });
  readonly #gameHandler = new GameCommandHandler(this.rooms, this.#roomHandler);
  readonly #sequences = new Map<string, number>();
  readonly #results = new Map<string, CommandResponse>();
  readonly #dispatcher = new CommandDispatcher(
    this.rooms,
    (command, room) =>
      command.type === 'room.create' ||
      command.type === 'room.join' ||
      room?.players.some(
        ({ playerId, status }) =>
          playerId === command.playerId && status !== 'left',
      ) === true,
    (command, room) => this.handle(command, room),
  );

  dispatch(input: unknown): CommandResponse {
    const resultKey = this.commandResultKey(input);
    if (resultKey) {
      const previous = this.#results.get(resultKey);
      if (previous) return previous;
    }
    const response = this.#dispatcher.dispatch(input);
    if (response.status !== 'accepted') return response;
    const command = input as ClientCommand;
    const sequence = (this.#sequences.get(command.roomId) ?? 0) + 1;
    this.#sequences.set(command.roomId, sequence);
    const sequenced = Object.freeze({ ...response, sequence });
    if (resultKey) this.#results.set(resultKey, sequenced);
    return sequenced;
  }

  currentRoomId(): string | null {
    return this.rooms.listRoomIds()[0] ?? null;
  }

  create(
    request: CreateRoomSessionRequest,
    baseJoinUrl: string,
  ): RoomSessionResponse {
    if (this.rooms.listRoomIds().length > 0) {
      throw new RangeError('This host already has a room');
    }
    const roomId = randomUUID();
    const playerId = randomUUID();
    const token = this.issueToken();
    const response = this.dispatch({
      protocolVersion: PROTOCOL_VERSION,
      commandId: randomUUID(),
      roomId,
      playerId,
      expectedVersion: 0,
      type: 'room.create',
      hostNickname: request.hostNickname,
      settings: request.settings,
    });
    if (response.status !== 'accepted') {
      throw new Error('Room creation was rejected');
    }
    this.sessions.register({ roomId, playerId }, token);
    return this.sessionResponse(roomId, playerId, token, baseJoinUrl);
  }

  join(
    roomId: string,
    request: JoinRoomSessionRequest,
    baseJoinUrl: string,
  ): RoomSessionResponse {
    const room = this.rooms.get(roomId);
    if (!room || room.phase !== 'lobby' || room.firstHandStarted) {
      throw new RangeError('Room is not accepting new players');
    }
    const playerId = randomUUID();
    const token = this.issueToken();
    const response = this.dispatch({
      protocolVersion: PROTOCOL_VERSION,
      commandId: randomUUID(),
      roomId,
      playerId,
      expectedVersion: room.version,
      type: 'room.join',
      nickname: request.nickname,
    });
    if (response.status !== 'accepted') {
      throw new Error('Joining the room was rejected');
    }
    this.sessions.register({ roomId, playerId }, token);
    return this.sessionResponse(roomId, playerId, token, baseJoinUrl);
  }

  snapshot(roomId: string, playerId: string): PlayerSnapshot | null {
    const room = this.rooms.get(roomId);
    if (!room || !room.players.some((player) => player.playerId === playerId)) {
      return null;
    }
    return projectPlayerSnapshot({
      room,
      viewerPlayerId: playerId,
      sequence: this.#sequences.get(roomId) ?? 0,
      hand: this.#roomHandler.getCurrentHand(roomId),
      handReady: this.#roomHandler.getHandReady(roomId),
      chipRequests: this.#roomHandler.getChipRequests(roomId),
    });
  }

  snapshotsForRoom(roomId: string): readonly PlayerSnapshot[] {
    const room = this.rooms.get(roomId);
    if (!room) return Object.freeze([]);
    return Object.freeze(
      room.players.flatMap((player) => {
        const projected = this.snapshot(roomId, player.playerId);
        return projected ? [projected] : [];
      }),
    );
  }

  private handle(
    command: ClientCommand,
    room: ReturnType<InMemoryRoomRegistry['get']>,
  ): CommandHandlerResult {
    const betting = BettingCommandSchema.safeParse(command);
    return betting.success
      ? this.#gameHandler.handle(betting.data, room)
      : this.#roomHandler.handle(command, room);
  }

  private commandResultKey(input: unknown): string | null {
    if (
      typeof input !== 'object' ||
      input === null ||
      !('playerId' in input) ||
      typeof input.playerId !== 'string' ||
      !('commandId' in input) ||
      typeof input.commandId !== 'string'
    ) {
      return null;
    }
    return `${input.playerId}\u0000${input.commandId}`;
  }

  private issueToken(): string {
    return randomBytes(32).toString('base64url');
  }

  private sessionResponse(
    roomId: string,
    playerId: string,
    token: string,
    baseJoinUrl: string,
  ): RoomSessionResponse {
    const url = new URL(baseJoinUrl);
    url.searchParams.set('room', roomId);
    return Object.freeze({
      protocolVersion: PROTOCOL_VERSION,
      roomId,
      playerId,
      token,
      joinUrl: url.toString(),
      socketPath: '/socket.io',
    });
  }
}
