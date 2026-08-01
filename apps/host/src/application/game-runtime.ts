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
  readonly #completedHands = new Map<string, number>();
  readonly #results = new Map<string, CommandResponse>();
  readonly #handReadyTimers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #automaticListeners = new Set<(roomId: string) => void>();
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
    const previousRoom =
      typeof input === 'object' &&
      input !== null &&
      'roomId' in input &&
      typeof input.roomId === 'string'
        ? this.rooms.get(input.roomId)
        : null;
    const response = this.#dispatcher.dispatch(input);
    if (response.status !== 'accepted') return response;
    const command = input as ClientCommand;
    const afterCommand = this.rooms.get(command.roomId);
    if (
      previousRoom?.phase === 'playing' &&
      afterCommand?.phase === 'hand-ready'
    ) {
      this.#completedHands.set(
        command.roomId,
        (this.#completedHands.get(command.roomId) ?? 0) + 1,
      );
    }
    this.startNextHandIfReady(command.roomId, false);
    this.scheduleHandReadyTimeout(command.roomId);
    const sequence = (this.#sequences.get(command.roomId) ?? 0) + 1;
    this.#sequences.set(command.roomId, sequence);
    const sequenced = Object.freeze({
      ...response,
      stateVersion:
        this.rooms.get(command.roomId)?.version ?? response.stateVersion,
      sequence,
    });
    if (resultKey) this.#results.set(resultKey, sequenced);
    return sequenced;
  }

  currentRoomId(): string | null {
    return this.rooms.listRoomIds()[0] ?? null;
  }

  onAutomaticStateChange(listener: (roomId: string) => void): () => void {
    this.#automaticListeners.add(listener);
    return () => this.#automaticListeners.delete(listener);
  }

  dispose(): void {
    for (const timer of this.#handReadyTimers.values()) clearTimeout(timer);
    this.#handReadyTimers.clear();
    this.#automaticListeners.clear();
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
      completedHands: this.#completedHands.get(roomId) ?? 0,
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

  private startNextHandIfReady(
    roomId: string,
    deadlineElapsed: boolean,
  ): boolean {
    const room = this.rooms.get(roomId);
    const ready = this.#roomHandler.getHandReady(roomId);
    if (!room || !ready || room.phase !== 'hand-ready') return false;
    const completedHands = this.#completedHands.get(roomId) ?? 0;
    const growth = room.settings.blindGrowth;
    const growthSteps = growth.enabled
      ? Math.floor(completedHands / growth.intervalHands)
      : 0;
    const smallBlind = Math.max(
      1,
      Math.floor(room.settings.smallBlind * growth.multiplier ** growthSteps),
    );
    const started = this.#roomHandler.startNextHandIfReady(roomId, {
      handId: randomUUID(),
      nowMs: Date.now(),
      deadlineElapsed,
      smallBlind,
    });
    if (!started) return false;
    const timer = this.#handReadyTimers.get(roomId);
    if (timer) clearTimeout(timer);
    this.#handReadyTimers.delete(roomId);
    return true;
  }

  private scheduleHandReadyTimeout(roomId: string): void {
    if (this.#handReadyTimers.has(roomId)) return;
    const ready = this.#roomHandler.getHandReady(roomId);
    if (!ready) return;
    const delayMs = Math.max(0, ready.deadlineMs - Date.now());
    const timer = setTimeout(() => {
      this.#handReadyTimers.delete(roomId);
      if (!this.startNextHandIfReady(roomId, true)) return;
      this.#sequences.set(roomId, (this.#sequences.get(roomId) ?? 0) + 1);
      this.#automaticListeners.forEach((listener) => listener(roomId));
    }, delayMs);
    timer.unref?.();
    this.#handReadyTimers.set(roomId, timer);
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
