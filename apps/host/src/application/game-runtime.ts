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
  rebuildStatistics,
  type StatisticsFactStorePort,
  type StoredStatisticsFact,
} from './statistics-store.js';
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
import type { HandSummaryEvent } from '@texas-holdem/poker-core';
import type { RoomRecoveryState } from './persistence-ports.js';
import type { PlayerActionEvent } from '../statistics/basic-statistics.js';

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

export interface GameRuntimeStateExport extends RoomRecoveryState {
  readonly sequence: number;
  readonly reconnectTokens: Readonly<Record<string, string>>;
}

export class GameRuntime implements RoomSessionBootstrapService {
  readonly rooms = new InMemoryRoomRegistry();
  readonly sessions: InMemorySessionAuthenticator;
  readonly events = new InMemoryEventBuffer();
  readonly reconnect = new ReconnectSynchronizer(
    this.events,
    (roomId, playerId) => this.snapshot(roomId, playerId),
  );

  readonly #roomHandler = new RoomCommandHandler(this.rooms, {
    next: () => Math.random(),
  });
  readonly #summaries = new Map<string, HandSummaryEvent[]>();
  readonly #facts = new Map<string, StoredStatisticsFact[]>();
  readonly #gameHandler = new GameCommandHandler(
    this.rooms,
    this.#roomHandler,
    Date.now,
    {
      onPlayerAction: (event) => {
        this.recordPlayerAction(event);
      },
      onHandSettled: (summary) => this.recordSummary(summary),
    },
  );
  readonly #sequences = new Map<string, number>();
  readonly #completedHands = new Map<string, number>();
  readonly #results = new Map<string, CommandResponse>();
  readonly #handReadyTimers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #actionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #actionDeadlines = new Map<
    string,
    {
      readonly handId: string;
      readonly actorId: string;
      readonly deadlineMs: number;
    }
  >();
  readonly #automaticListeners = new Set<(roomId: string) => void>();
  readonly #committedListeners = new Set<(roomId: string) => void>();
  readonly #reconnectTokens = new Map<string, Map<string, string>>();
  readonly #statisticsStore: StatisticsFactStorePort | null;
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

  constructor(
    options: {
      readonly sessionFallback?: (
        credentials: Parameters<
          InMemorySessionAuthenticator['authenticate']
        >[0],
      ) => ReturnType<InMemorySessionAuthenticator['authenticate']>;
      readonly statisticsStore?: StatisticsFactStorePort;
    } = {},
  ) {
    this.sessions = new InMemorySessionAuthenticator(options.sessionFallback);
    this.#statisticsStore = options.statisticsStore ?? null;
  }

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
    const playingRoom = this.rooms.get(command.roomId);
    if (playingRoom) this.#gameHandler.resolveAutomatic(playingRoom);
    this.scheduleHandReadyTimeout(command.roomId);
    this.scheduleActionTimeout(command.roomId);
    const sequence = (this.#sequences.get(command.roomId) ?? 0) + 1;
    this.#sequences.set(command.roomId, sequence);
    const sequenced = Object.freeze({
      ...response,
      stateVersion:
        this.rooms.get(command.roomId)?.version ?? response.stateVersion,
      sequence,
    });
    if (resultKey) this.#results.set(resultKey, sequenced);
    this.#committedListeners.forEach((listener) => listener(command.roomId));
    return sequenced;
  }

  currentRoomId(): string | null {
    return this.rooms.listRoomIds()[0] ?? null;
  }

  onAutomaticStateChange(listener: (roomId: string) => void): () => void {
    this.#automaticListeners.add(listener);
    return () => this.#automaticListeners.delete(listener);
  }

  onStateCommitted(listener: (roomId: string) => void): () => void {
    this.#committedListeners.add(listener);
    return () => this.#committedListeners.delete(listener);
  }

  restore(state: RoomRecoveryState, sequence: number): void {
    if (this.rooms.listRoomIds().length > 0) {
      throw new RangeError('Cannot restore over an active runtime');
    }
    this.#roomHandler.restoreState(state);
    this.#sequences.set(state.room.roomId, sequence);
    if (this.#statisticsStore) {
      this.#completedHands.set(
        state.room.roomId,
        this.#statisticsStore.loadSummaries(state.room.roomId).length,
      );
    }
    this.scheduleHandReadyTimeout(state.room.roomId);
    this.scheduleActionTimeout(state.room.roomId);
  }

  createRecoveredHostSession(baseJoinUrl: string): RoomSessionResponse {
    const roomId = this.currentRoomId();
    if (!roomId) throw new RangeError('No recovered room is running');
    const room = this.rooms.get(roomId);
    if (!room) throw new RangeError('No recovered room is running');
    const playerId = room.hostPlayerId;
    const token = this.issueToken();
    this.sessions.register({ roomId, playerId }, token);
    this.rememberReconnectToken(roomId, playerId, token);
    this.#committedListeners.forEach((listener) => listener(roomId));
    return this.sessionResponse(roomId, playerId, token, baseJoinUrl);
  }

  exportState(roomId: string): GameRuntimeStateExport | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    return Object.freeze({
      room,
      hand: this.#roomHandler.getCurrentHand(roomId),
      handReady: this.#roomHandler.getHandReady(roomId),
      chipRequests: this.#roomHandler.getChipRequests(roomId),
      sequence: this.#sequences.get(roomId) ?? 0,
      reconnectTokens: Object.freeze(
        Object.fromEntries(this.#reconnectTokens.get(roomId) ?? []),
      ),
    });
  }

  dispose(): void {
    for (const timer of this.#handReadyTimers.values()) clearTimeout(timer);
    for (const timer of this.#actionTimers.values()) clearTimeout(timer);
    this.#handReadyTimers.clear();
    this.#actionTimers.clear();
    this.#actionDeadlines.clear();
    this.#automaticListeners.clear();
    this.#committedListeners.clear();
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
    this.rememberReconnectToken(roomId, playerId, token);
    this.#committedListeners.forEach((listener) => listener(roomId));
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
    this.rememberReconnectToken(roomId, playerId, token);
    this.#committedListeners.forEach((listener) => listener(roomId));
    return this.sessionResponse(roomId, playerId, token, baseJoinUrl);
  }

  snapshot(roomId: string, playerId: string): PlayerSnapshot | null {
    const room = this.rooms.get(roomId);
    if (!room || !room.players.some((player) => player.playerId === playerId)) {
      return null;
    }
    const initialChips = Object.fromEntries(
      room.players.map((player) => [
        player.playerId,
        room.settings.initialChips,
      ]),
    );
    const summaries = this.#statisticsStore
      ? this.#statisticsStore.loadSummaries(roomId)
      : (this.#summaries.get(roomId) ?? []);
    const currentHandId = this.#roomHandler.getCurrentHand(roomId)?.handId;
    const currentHandAlreadySummarized = summaries.some(
      ({ handId }) => handId === currentHandId,
    );
    const facts = [
      ...(this.#statisticsStore
        ?.loadFacts(roomId)
        .map((event) => ({ event })) ??
        summaries.flatMap((summary) => this.#facts.get(summary.handId) ?? [])),
      ...(currentHandId && !currentHandAlreadySummarized
        ? (this.#facts.get(currentHandId) ?? [])
        : []),
    ];
    const rebuilt = rebuildStatistics(
      {
        saveSummary: () => undefined,
        saveFacts: () => undefined,
        loadSummaries: () => summaries,
        loadFacts: () => facts.map(({ event }) => event),
      },
      roomId,
      initialChips,
    );
    const hand = this.#roomHandler.getCurrentHand(roomId);
    const scheduledAction = this.#actionDeadlines.get(roomId);
    const actionDeadlineMs =
      hand &&
      scheduledAction?.handId === hand.handId &&
      scheduledAction.actorId === hand.betting.currentActorId
        ? scheduledAction.deadlineMs
        : null;
    return projectPlayerSnapshot({
      room,
      viewerPlayerId: playerId,
      sequence: this.#sequences.get(roomId) ?? 0,
      hand,
      actionDeadlineMs,
      handReady: this.#roomHandler.getHandReady(roomId),
      chipRequests: this.#roomHandler.getChipRequests(roomId),
      completedHands: this.#completedHands.get(roomId) ?? 0,
      statistics: room.players.map((player) => ({
        playerId: player.playerId,
        currentChips:
          rebuilt.basic[player.playerId]?.currentChips ?? player.chips,
        participatedHands:
          rebuilt.basic[player.playerId]?.participatedHands ?? 0,
        wonHands: rebuilt.basic[player.playerId]?.wonHands ?? 0,
        largestSingleHandProfit:
          rebuilt.outcomes[player.playerId]?.largestSingleHandProfit ?? 0,
        largestWonPot: rebuilt.basic[player.playerId]?.largestWonPot ?? 0,
        showdownCount: rebuilt.outcomes[player.playerId]?.showdownCount ?? 0,
        showdownWinRate:
          rebuilt.outcomes[player.playerId]?.showdownWinRate ?? null,
        actions: rebuilt.basic[player.playerId]?.actionCounts ?? {
          fold: 0,
          check: 0,
          call: 0,
          raiseTo: 0,
          allIn: 0,
        },
      })),
      titles: rebuilt.titles,
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

  private recordSummary(summary: HandSummaryEvent): void {
    const room = this.rooms
      .listRoomIds()
      .find(
        (roomId) =>
          this.#roomHandler.getCurrentHand(roomId)?.handId === summary.handId,
      );
    if (!room) return;
    if (summary.reason === 'showdown' && summary.participants.length === 2) {
      const winner = summary.winnerIds[0];
      const loser = summary.participants.find(
        ({ playerId }) => !summary.winnerIds.includes(playerId),
      )?.playerId;
      if (winner && loser) {
        const facts = this.#facts.get(summary.handId) ?? [];
        facts.push({
          factId: randomUUID(),
          event: {
            type: 'showdown.heads-up-loss',
            handId: summary.handId,
            loserPlayerId: loser,
            winnerPlayerId: winner,
            contenderCount: 2,
          },
        });
        this.#facts.set(summary.handId, facts);
      }
    }
    if (this.#statisticsStore) {
      const createdAtMs = Date.now();
      this.#statisticsStore.saveSummary(
        room,
        (this.#sequences.get(room) ?? 0) + 1,
        summary,
        createdAtMs,
      );
      this.#statisticsStore.saveFacts(
        room,
        this.#facts.get(summary.handId) ?? [],
        createdAtMs,
      );
      this.#facts.delete(summary.handId);
      return;
    }
    const summaries = this.#summaries.get(room) ?? [];
    summaries.push(summary);
    this.#summaries.set(room, summaries);
  }

  private recordPlayerAction(event: PlayerActionEvent): void {
    const facts = this.#facts.get(event.handId) ?? [];
    facts.push({ factId: randomUUID(), event });
    this.#facts.set(event.handId, facts);
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
      this.#committedListeners.forEach((listener) => listener(roomId));
      this.scheduleActionTimeout(roomId);
    }, delayMs);
    timer.unref?.();
    this.#handReadyTimers.set(roomId, timer);
  }

  private scheduleActionTimeout(roomId: string): void {
    const existing = this.#actionTimers.get(roomId);
    if (existing) clearTimeout(existing);
    this.#actionTimers.delete(roomId);
    this.#actionDeadlines.delete(roomId);
    const room = this.rooms.get(roomId);
    const hand = this.#roomHandler.getCurrentHand(roomId);
    const actorId = hand?.betting.currentActorId;
    if (!room || room.phase !== 'playing' || !hand || !actorId) return;
    const legal = hand.betting.players.find(
      ({ playerId }) => playerId === actorId,
    );
    if (!legal) return;
    const deadlineMs = Date.now() + room.settings.actionTimeoutSeconds * 1_000;
    this.#actionDeadlines.set(roomId, {
      handId: hand.handId,
      actorId,
      deadlineMs,
    });
    const timer = setTimeout(
      () => {
        this.#actionTimers.delete(roomId);
        this.#actionDeadlines.delete(roomId);
        const currentRoom = this.rooms.get(roomId);
        const currentHand = this.#roomHandler.getCurrentHand(roomId);
        if (
          !currentRoom ||
          currentRoom.phase !== 'playing' ||
          currentHand?.handId !== hand.handId ||
          currentHand.betting.currentActorId !== actorId
        ) {
          return;
        }
        const actor = currentHand.betting.players.find(
          ({ playerId }) => playerId === actorId,
        );
        if (!actor) return;
        const commandType =
          actor.streetCommitted === currentHand.betting.currentBet
            ? 'game.check'
            : 'game.fold';
        const response = this.dispatch({
          protocolVersion: PROTOCOL_VERSION,
          commandId: randomUUID(),
          roomId,
          playerId: actorId,
          expectedVersion: currentRoom.version,
          type: commandType,
        });
        if (response.status === 'accepted') {
          this.#automaticListeners.forEach((listener) => listener(roomId));
        }
      },
      Math.max(0, deadlineMs - Date.now()),
    );
    timer.unref?.();
    this.#actionTimers.set(roomId, timer);
  }

  private rememberReconnectToken(
    roomId: string,
    playerId: string,
    token: string,
  ): void {
    const tokens = this.#reconnectTokens.get(roomId) ?? new Map();
    tokens.set(playerId, token);
    this.#reconnectTokens.set(roomId, tokens);
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
