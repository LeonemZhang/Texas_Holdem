import { randomBytes, randomUUID } from 'node:crypto';

import {
  BettingCommandSchema,
  PROTOCOL_VERSION,
  RoomRecordStatisticsSchema,
  type CommandResponse,
  type ChipActivity,
  type CreateRoomSessionRequest,
  type JoinRoomSessionRequest,
  type PlayerSnapshot,
  type ResumeRoomSessionRequest,
  type RoomSessionResponse,
  type SocketAuthentication,
} from '@texas-holdem/protocol';

import { GameCommandHandler } from './game-command-handler.js';
import { timedOutBettingAction } from './deadline-scheduler.js';
import {
  rebuildStatistics,
  type StatisticsFactStorePort,
  type StoredStatisticsFact,
} from './statistics-store.js';
import { createRiverComebackEvents } from '../statistics/fact-statistics.js';
import {
  CommandDispatcher,
  type ClientCommand,
  type CommandHandlerResult,
} from './command-dispatcher.js';
import { InMemoryEventBuffer } from './event-buffer.js';
import { ReconnectSynchronizer } from './reconnect-synchronizer.js';
import { RoomCommandHandler } from './room-command-handler.js';
import { InMemoryRoomRegistry } from './room-registry.js';
import {
  InMemorySessionAuthenticator,
  type SessionIdentity,
} from './session-authenticator.js';
import { projectPlayerSnapshot } from './snapshot-projector.js';
import { createStatisticsView } from './statistics-view.js';
import {
  calculateBlindLevel,
  findBestAvailableFiveCardHand,
  formatCard,
  type HandSummaryEvent,
  type ShowdownSettledHand,
  type UncontestedSettledHand,
} from '@texas-holdem/poker-core';
import type { RoomRecoveryState } from './persistence-ports.js';
import type { PlayerActionEvent } from '../statistics/basic-statistics.js';
import type { ChipRequestBook } from '../domain/chip-requests.js';

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
  resume(
    roomId: string,
    request: ResumeRoomSessionRequest,
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

  readonly #roomHandler = new RoomCommandHandler(
    this.rooms,
    {
      next: () => Math.random(),
    },
    (roomId, room) =>
      calculateBlindLevel(
        room.settings.smallBlind,
        this.#completedHands.get(roomId) ?? 0,
        room.settings.blindGrowth,
      ).bigBlind,
  );
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
  readonly #chipActivity = new Map<string, readonly ChipActivity[]>();
  readonly #results = new Map<string, CommandResponse>();
  readonly #handReadyTimers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #actionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #runoutTimers = new Map<string, ReturnType<typeof setTimeout>>();
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
    (command, room) => {
      if (command.type === 'room.create' || command.type === 'room.join') {
        return true;
      }
      const player = room?.players.find(
        ({ playerId }) => playerId === command.playerId,
      );
      if (!player || ['left', 'removed'].includes(player.status)) return false;
      const isBettingCommand = [
        'game.fold',
        'game.check',
        'game.call',
        'game.raise-to',
        'game.all-in',
      ].includes(command.type);
      return !isBettingCommand || player.status === 'active';
    },
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
    return this.dispatchCommand(input);
  }

  private dispatchCommand(
    input: unknown,
    options: { readonly bypassAuthorization?: boolean } = {},
  ): CommandResponse {
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
    const previousRequests =
      previousRoom === null
        ? null
        : this.#roomHandler.getChipRequests(previousRoom.roomId);
    const response = this.#dispatcher.dispatch(input, options);
    if (response.status !== 'accepted') return response;
    const command = input as ClientCommand;
    const afterCommand = this.rooms.get(command.roomId);
    if (command.type === 'game.show-hole-cards') {
      this.recordVoluntaryHoleCardReveal(command.roomId, command.playerId);
    }
    if (
      previousRoom?.phase === 'playing' &&
      afterCommand?.phase === 'hand-ready'
    ) {
      this.#completedHands.set(
        command.roomId,
        (this.#completedHands.get(command.roomId) ?? 0) + 1,
      );
    }
    const sequence = (this.#sequences.get(command.roomId) ?? 0) + 1;
    this.syncChipActivity(
      command,
      previousRequests,
      this.#roomHandler.getChipRequests(command.roomId),
      sequence,
    );
    this.startNextHandIfReady(command.roomId, false);
    this.scheduleHandReadyTimeout(command.roomId);
    this.scheduleActionTimeout(command.roomId);
    this.scheduleAutomaticRunout(command.roomId);
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

  authenticate(credentials: SocketAuthentication): SessionIdentity | null {
    const identity = this.sessions.authenticate(credentials);
    if (!identity) return null;
    const player = this.rooms
      .get(identity.roomId)
      ?.players.find(({ playerId }) => playerId === identity.playerId);
    return player && !['left', 'removed'].includes(player.status)
      ? identity
      : null;
  }

  retireClosedRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room || room.phase !== 'closed') {
      throw new RangeError('Only a closed room can be retired');
    }
    const handTimer = this.#handReadyTimers.get(roomId);
    if (handTimer) clearTimeout(handTimer);
    const actionTimer = this.#actionTimers.get(roomId);
    if (actionTimer) clearTimeout(actionTimer);
    const runoutTimer = this.#runoutTimers.get(roomId);
    if (runoutTimer) clearTimeout(runoutTimer);
    this.#handReadyTimers.delete(roomId);
    this.#actionTimers.delete(roomId);
    this.#runoutTimers.delete(roomId);
    this.#actionDeadlines.delete(roomId);
    this.#summaries.delete(roomId);
    this.#facts.delete(roomId);
    this.#sequences.delete(roomId);
    this.#completedHands.delete(roomId);
    this.#reconnectTokens.delete(roomId);
    this.#roomHandler.retireRoom(roomId);
    this.rooms.delete(roomId);
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
    this.#chipActivity.set(state.room.roomId, state.chipActivity);
    for (const fact of state.pendingStatisticsFacts ?? []) {
      const facts = this.#facts.get(fact.event.handId) ?? [];
      facts.push(fact);
      this.#facts.set(fact.event.handId, facts);
    }
    this.#sequences.set(state.room.roomId, sequence);
    if (this.#statisticsStore) {
      this.#completedHands.set(
        state.room.roomId,
        this.#statisticsStore.loadSummaries(state.room.roomId).length,
      );
    }
    this.scheduleHandReadyTimeout(state.room.roomId);
    this.scheduleActionTimeout(state.room.roomId);
    this.scheduleAutomaticRunout(state.room.roomId);
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

  closeRunningRoom(): string {
    const roomId = this.currentRoomId();
    if (!roomId) throw new RangeError('No room is running');
    const room = this.rooms.get(roomId);
    if (!room) throw new RangeError('No room is running');
    const response = this.dispatch({
      protocolVersion: PROTOCOL_VERSION,
      commandId: randomUUID(),
      roomId,
      playerId: room.hostPlayerId,
      expectedVersion: room.version,
      type: 'room.close',
    });
    if (response.status !== 'accepted') {
      throw new RangeError('Running room could not be closed');
    }
    return roomId;
  }

  exportState(roomId: string): GameRuntimeStateExport | null {
    const room = this.rooms.get(roomId);
    if (!room) return null;
    return Object.freeze({
      room,
      hand: this.#roomHandler.getCurrentHand(roomId),
      handReady: this.#roomHandler.getHandReady(roomId),
      chipRequests: this.#roomHandler.getChipRequests(roomId),
      chipActivity: this.#chipActivity.get(roomId) ?? Object.freeze([]),
      pendingStatisticsFacts: Object.freeze([...this.#facts.values()].flat()),
      sequence: this.#sequences.get(roomId) ?? 0,
      reconnectTokens: Object.freeze(
        Object.fromEntries(this.#reconnectTokens.get(roomId) ?? []),
      ),
    });
  }

  dispose(): void {
    for (const timer of this.#handReadyTimers.values()) clearTimeout(timer);
    for (const timer of this.#actionTimers.values()) clearTimeout(timer);
    for (const timer of this.#runoutTimers.values()) clearTimeout(timer);
    this.#handReadyTimers.clear();
    this.#actionTimers.clear();
    this.#runoutTimers.clear();
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

  resume(
    roomId: string,
    request: ResumeRoomSessionRequest,
    baseJoinUrl: string,
  ): RoomSessionResponse {
    const room = this.rooms.get(roomId);
    if (!room || room.phase === 'closed') {
      throw new RangeError('Room is not available for recovery');
    }
    const identity = this.sessions.authenticate({
      protocolVersion: PROTOCOL_VERSION,
      roomId,
      playerId: request.playerId,
      token: request.token,
    });
    if (
      !identity ||
      identity.roomId !== roomId ||
      identity.playerId !== request.playerId
    ) {
      throw new RangeError('Recovery identity is invalid');
    }
    const player = room.players.find(
      ({ playerId }) => playerId === identity.playerId,
    );
    if (!player) throw new RangeError('Recovery player is not in this room');
    if (player.status === 'removed') {
      throw new RangeError('Player was removed from this room');
    }
    if (
      request.nickname !== undefined &&
      (player.status !== 'left' || room.phase !== 'lobby')
    ) {
      throw new RangeError(
        'Nickname can only be changed while recovering to the lobby',
      );
    }
    if (player.status === 'left') {
      this.#roomHandler.resumeLeftPlayer(
        roomId,
        identity.playerId,
        request.nickname,
      );
      this.#sequences.set(roomId, (this.#sequences.get(roomId) ?? 0) + 1);
      this.#committedListeners.forEach((listener) => listener(roomId));
    }
    this.sessions.register(identity, request.token);
    this.rememberReconnectToken(roomId, identity.playerId, request.token);
    return this.sessionResponse(
      roomId,
      identity.playerId,
      request.token,
      baseJoinUrl,
    );
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
        updateSummary: () => undefined,
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
    const statisticsView = createStatisticsView(room, rebuilt);
    return projectPlayerSnapshot({
      room,
      viewerPlayerId: playerId,
      sequence: this.#sequences.get(roomId) ?? 0,
      hand,
      actionDeadlineMs,
      handReady: this.#roomHandler.getHandReady(roomId),
      chipRequests: this.#roomHandler.getChipRequests(roomId),
      chipActivity: this.#chipActivity.get(roomId) ?? Object.freeze([]),
      completedHands: this.#completedHands.get(roomId) ?? 0,
      statistics: statisticsView.players,
      titles: statisticsView.titles,
      handPeaks: statisticsView.handPeaks,
    });
  }

  statisticsForRoom(roomId: string) {
    const room = this.rooms.get(roomId);
    const viewer = room?.players[0];
    if (!room || !viewer) return null;
    const snapshot = this.snapshot(roomId, viewer.playerId);
    return snapshot
      ? RoomRecordStatisticsSchema.parse({
          players: snapshot.statistics.players.map((player) => ({
            ...player,
            nickname:
              room.players.find(({ playerId }) => playerId === player.playerId)
                ?.nickname ?? player.playerId,
            removed:
              room.players.find(({ playerId }) => playerId === player.playerId)
                ?.status === 'removed',
            initialChips: room.settings.initialChips,
          })),
          titles: snapshot.statistics.titles,
          handPeaks: snapshot.statistics.handPeaks,
        })
      : null;
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

  private syncChipActivity(
    command: ClientCommand,
    previousRequests: ChipRequestBook | null,
    nextRequests: ChipRequestBook | null,
    sequence: number,
  ): void {
    const occurredAtMs = Date.now();
    const previous = this.#chipActivity.get(command.roomId) ?? [];
    const next: ChipActivity[] = [...previous];
    for (const request of nextRequests?.requests ?? []) {
      const index = next.findIndex(
        (record) =>
          record.kind === 'request' && record.requestId === request.requestId,
      );
      const previousRequest = previousRequests?.requests.find(
        ({ requestId }) => requestId === request.requestId,
      );
      if (index < 0) {
        next.push({
          kind: 'request' as const,
          requestId: request.requestId,
          requesterId: request.requesterId,
          targetPlayerId: request.targetPlayerId,
          amount: request.amount,
          status: request.status,
          rejectedByPlayerIds: [...request.rejectedByPlayerIds],
          completedByPlayerId:
            command.type === 'chips.approve' &&
            command.requestId === request.requestId
              ? command.playerId
              : null,
          createdSequence: sequence,
          updatedSequence: sequence,
          createdAtMs: occurredAtMs,
          updatedAtMs: occurredAtMs,
        });
        continue;
      }
      const record = next[index];
      if (
        record?.kind !== 'request' ||
        (previousRequest?.status === request.status &&
          previousRequest.rejectedByPlayerIds.length ===
            request.rejectedByPlayerIds.length)
      ) {
        continue;
      }
      next[index] = {
        ...record,
        status: request.status,
        rejectedByPlayerIds: [...request.rejectedByPlayerIds],
        completedByPlayerId:
          command.type === 'chips.approve' &&
          command.requestId === request.requestId
            ? command.playerId
            : record.completedByPlayerId,
        updatedSequence: sequence,
        updatedAtMs: occurredAtMs,
      };
    }
    if (command.type === 'chips.give') {
      next.push({
        kind: 'direct-transfer' as const,
        transferId: command.transferId,
        fromPlayerId: command.playerId,
        toPlayerId: command.receiverPlayerId,
        amount: command.amount,
        completedSequence: sequence,
        completedAtMs: occurredAtMs,
      });
    }
    this.#chipActivity.set(command.roomId, Object.freeze(next));
  }

  private recordSummary(summary: HandSummaryEvent): void {
    const room = this.rooms
      .listRoomIds()
      .find(
        (roomId) =>
          this.#roomHandler.getCurrentHand(roomId)?.handId === summary.handId,
      );
    if (!room) return;
    const facts = this.#facts.get(summary.handId) ?? [];
    for (const event of createRiverComebackEvents(summary)) {
      facts.push({ factId: randomUUID(), event });
    }
    this.#facts.set(summary.handId, facts);
    const showdownPlayerIds = Object.keys(summary.revealedHoleCards);
    if (summary.reason === 'showdown' && showdownPlayerIds.length === 2) {
      const winner = summary.winnerIds[0];
      const loser = showdownPlayerIds.find(
        (playerId) => !summary.winnerIds.includes(playerId),
      );
      if (winner && loser) {
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

  private recordVoluntaryHoleCardReveal(
    roomId: string,
    playerId: string,
  ): void {
    const hand = this.#roomHandler.getCurrentHand(roomId);
    if (!hand || !('settlement' in hand)) return;
    const settledHand = hand as ShowdownSettledHand | UncontestedSettledHand;
    const player = hand.players.find(
      (candidate) => candidate.playerId === playerId,
    );
    const availableCards = player
      ? [...hand.communityCards, ...player.holeCards]
      : [];
    if (!player || availableCards.length < 5) return;

    const summaries = this.#statisticsStore
      ? this.#statisticsStore.loadSummaries(roomId)
      : (this.#summaries.get(roomId) ?? []);
    const summary = summaries.find(({ handId }) => handId === hand.handId);
    if (!summary) return;

    const best = findBestAvailableFiveCardHand(availableCards);
    const shouldRecordHandPeak =
      settledHand.settlement.reason === 'showdown'
        ? playerId in settledHand.settlement.bestHands
        : settledHand.settlement.winnerIds.includes(playerId);
    const updatedSummary = Object.freeze({
      ...summary,
      revealedHoleCards: Object.freeze({
        ...summary.revealedHoleCards,
        [playerId]: Object.freeze(player.holeCards.map(formatCard)),
      }),
      ...(shouldRecordHandPeak
        ? {
            evaluatedHands: Object.freeze({
              ...(summary.evaluatedHands ?? {}),
              [playerId]: Object.freeze({
                rank: best.rank,
                bestFiveCards: Object.freeze(best.cards.map(formatCard)),
              }),
            }),
          }
        : {}),
    });

    if (this.#statisticsStore) {
      this.#statisticsStore.updateSummary(roomId, updatedSummary);
      return;
    }
    const inMemorySummaries = this.#summaries.get(roomId);
    if (!inMemorySummaries) return;
    const index = inMemorySummaries.findIndex(
      ({ handId }) => handId === hand.handId,
    );
    if (index >= 0) inMemorySummaries[index] = updatedSummary;
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
    const blindLevel = calculateBlindLevel(
      room.settings.smallBlind,
      completedHands,
      room.settings.blindGrowth,
    );
    const started = this.#roomHandler.startNextHandIfReady(roomId, {
      handId: randomUUID(),
      nowMs: Date.now(),
      deadlineElapsed,
      smallBlind: blindLevel.smallBlind,
      bigBlind: blindLevel.bigBlind,
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
        const roomPlayer = currentRoom.players.find(
          ({ playerId }) => playerId === actorId,
        );
        if (!roomPlayer) return;
        const timedOutAction = timedOutBettingAction(
          currentHand.betting,
          actorId,
        );
        const commandType =
          timedOutAction.type === 'check' ? 'game.check' : 'game.fold';
        const response = this.dispatchCommand(
          {
            protocolVersion: PROTOCOL_VERSION,
            commandId: randomUUID(),
            roomId,
            playerId: actorId,
            expectedVersion: currentRoom.version,
            type: commandType,
          },
          {
            bypassAuthorization: ['left', 'sitting-out'].includes(
              roomPlayer.status,
            ),
          },
        );
        if (response.status === 'accepted') {
          this.#automaticListeners.forEach((listener) => listener(roomId));
        }
      },
      Math.max(0, deadlineMs - Date.now()),
    );
    timer.unref?.();
    this.#actionTimers.set(roomId, timer);
  }

  private scheduleAutomaticRunout(roomId: string): void {
    const existing = this.#runoutTimers.get(roomId);
    if (existing) clearTimeout(existing);
    this.#runoutTimers.delete(roomId);
    const room = this.rooms.get(roomId);
    if (!room) return;
    const delayMs = this.#gameHandler.automaticRunoutDelayMs(room);
    if (delayMs === null) return;
    const timer = setTimeout(() => {
      this.#runoutTimers.delete(roomId);
      const currentRoom = this.rooms.get(roomId);
      if (!currentRoom) return;
      const previousPhase = currentRoom.phase;
      const result = this.#gameHandler.resolveAutomatic(currentRoom);
      if (!result) {
        this.scheduleAutomaticRunout(roomId);
        return;
      }
      const nextRoom = this.rooms.get(roomId);
      if (previousPhase === 'playing' && nextRoom?.phase === 'hand-ready') {
        this.#completedHands.set(
          roomId,
          (this.#completedHands.get(roomId) ?? 0) + 1,
        );
      }
      const sequence = (this.#sequences.get(roomId) ?? 0) + 1;
      this.#sequences.set(roomId, sequence);
      this.#committedListeners.forEach((listener) => listener(roomId));
      this.#automaticListeners.forEach((listener) => listener(roomId));
      this.scheduleHandReadyTimeout(roomId);
      this.scheduleActionTimeout(roomId);
      this.scheduleAutomaticRunout(roomId);
    }, delayMs);
    timer.unref?.();
    this.#runoutTimers.set(roomId, timer);
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
