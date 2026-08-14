import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { PlayerSnapshot } from '@texas-holdem/protocol';
import { PlayerSession, type SessionIdentity } from '../session.js';

type RegisteredSocket = Parameters<PlayerSession['connect']>[0];

interface MockSocketOptions {
  readonly commandAck?: (command: Record<string, unknown>) => unknown;
  readonly suppressCommandAck?: boolean;
}

interface MockSocketHarness {
  readonly socket: RegisteredSocket;
  readonly emitter: EventEmitter;
  readonly commands: Array<Record<string, unknown>>;
}

function acceptedResponse(
  command: Record<string, unknown>,
  stateVersion = 1,
  sequence = 1,
) {
  return {
    protocolVersion: '3',
    commandId:
      typeof command.commandId === 'string' ? command.commandId : 'cmd-1',
    status: 'accepted',
    stateVersion,
    sequence,
  };
}

function makeMockSocket(options: MockSocketOptions = {}): MockSocketHarness {
  const emitter = new EventEmitter();
  const commands: Array<Record<string, unknown>> = [];
  const socket = {
    connected: true,
    on: (event: string, fn: (...args: unknown[]) => void) => {
      emitter.on(event, fn);
      return {} as RegisteredSocket;
    },
    emit: (event: string, ...args: unknown[]) => {
      if (event === 'command:submit') {
        const command = args[0] as Record<string, unknown>;
        commands.push(command);
        const ack = args[1] as ((response: unknown) => void) | undefined;
        if (!options.suppressCommandAck && ack) {
          const response = options.commandAck
            ? options.commandAck(command)
            : acceptedResponse(command);
          ack(response);
        }
      }
      emitter.emit(event, ...args);
      return {} as RegisteredSocket;
    },
    removeAllListeners: () => {
      emitter.removeAllListeners();
      return {} as RegisteredSocket;
    },
    disconnect: () => {
      emitter.emit('disconnect');
      return {} as RegisteredSocket;
    },
  };

  return {
    socket: socket as unknown as RegisteredSocket,
    emitter,
    commands,
  };
}

const identity: SessionIdentity = {
  roomId: 'room-test',
  playerId: 'player-test',
  sessionToken: 'token-1234567890123456',
};

function makeSnapshot(overrides: Record<string, unknown> = {}): PlayerSnapshot {
  const base = {
    protocolVersion: '3',
    roomId: 'room-test',
    playerId: 'player-test',
    sequence: 1,
    stateVersion: 1,
    room: {
      roomName: 'Test Room',
      phase: 'playing',
      initialChips: 1000,
      smallBlind: 10,
      bigBlind: 20,
      completedHands: 0,
      players: [
        {
          playerId: 'player-test',
          nickname: 'AI',
          seatIndex: 0,
          chips: 1000,
          streetCommitted: 0,
          totalCommitted: 0,
          status: 'active',
          isHost: false,
          lobbyReady: false,
        },
      ],
    },
    game: {
      handId: 'hand-1',
      street: 'preflop',
      buttonPlayerId: 'player-test',
      smallBlindPlayerId: 'player-test',
      bigBlindPlayerId: 'player-test',
      currentActorId: 'player-test',
      communityCards: [],
      totalPot: 30,
      streetPots: [],
      ownHoleCards: ['As', 'Ks'],
      showdownHoleCards: {},
      legalActions: {
        canFold: false,
        canCheck: false,
        callAmount: 20,
        minimumRaiseTo: 40,
        maximumRaiseTo: 200,
        canAllIn: true,
      },
    },
    handReady: null,
    chipRequests: [],
    chipActivity: [],
    statistics: { players: [], titles: [] },
    ...overrides,
  };
  return base as unknown as PlayerSnapshot;
}

describe('PlayerSession', () => {
  let session: PlayerSession;

  beforeEach(() => {
    session = new PlayerSession();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts disconnected', () => {
    expect(session.state).toBe('disconnected');
    expect(session.connected).toBe(false);
    expect(session.snapshot).toBeNull();
  });

  it('transitions to connecting then connected', () => {
    const mock = makeMockSocket();
    session.connect(mock.socket, identity);
    expect(session.state).toBe('connecting');
    expect(session.playerId).toBe('player-test');
    mock.emitter.emit('connect');
    expect(session.state).toBe('connected');
    expect(session.connected).toBe(true);
  });

  it('updates snapshot on state:snapshot', () => {
    const mock = makeMockSocket();
    session.connect(mock.socket, identity);
    mock.emitter.emit('connect');
    const snapshot = makeSnapshot();
    mock.emitter.emit('state:snapshot', snapshot);
    expect(session.snapshot).not.toBeNull();
    expect(session.expectedVersion).toBe(1);
    expect(session.lastSequence).toBe(1);
    expect(session.isMyTurn).toBe(true);
    expect(session.legalActions).toEqual(snapshot.game?.legalActions);
  });

  it('ignores an older snapshot sequence', () => {
    const mock = makeMockSocket();
    session.connect(mock.socket, identity);
    mock.emitter.emit('connect');
    const listener = vi.fn();
    session.onSnapshot(listener);

    mock.emitter.emit(
      'state:snapshot',
      makeSnapshot({ sequence: 3, stateVersion: 3 }),
    );
    mock.emitter.emit(
      'state:snapshot',
      makeSnapshot({ sequence: 1, stateVersion: 1 }),
    );

    expect(session.snapshot?.sequence).toBe(3);
    expect(session.expectedVersion).toBe(3);
    expect(listener).toHaveBeenCalledOnce();
  });

  it('onSnapshot fires when snapshot arrives and unsubscribe works', () => {
    const mock = makeMockSocket();
    session.connect(mock.socket, identity);
    mock.emitter.emit('connect');
    const listener = vi.fn();
    const unsubscribe = session.onSnapshot(listener);
    mock.emitter.emit('state:snapshot', makeSnapshot());
    expect(listener).toHaveBeenCalledOnce();

    unsubscribe();
    mock.emitter.emit(
      'state:snapshot',
      makeSnapshot({ sequence: 2, stateVersion: 2 }),
    );
    expect(listener).toHaveBeenCalledOnce();
  });

  it('onDisconnect notifies listeners once per socket disconnect', () => {
    const mock = makeMockSocket();
    session.connect(mock.socket, identity);
    mock.emitter.emit('connect');
    const listener = vi.fn();
    session.onDisconnect(listener);

    mock.emitter.emit('disconnect');

    expect(listener).toHaveBeenCalledOnce();
    expect(session.state).toBe('disconnected');
  });

  it('submitCommand returns accepted and updates versions', async () => {
    const mock = makeMockSocket();
    session.connect(mock.socket, identity);
    mock.emitter.emit('connect');
    const response = await session.submitCommand({
      protocolVersion: '3',
      commandId: 'cmd-1',
      roomId: 'room-test',
      playerId: 'player-test',
      expectedVersion: 0,
      type: 'game.fold',
    });
    expect(response.status).toBe('accepted');
    expect(session.expectedVersion).toBe(1);
    expect(session.lastSequence).toBe(1);
  });

  it('uses the Host conflict currentVersion for subsequent commands', async () => {
    const mock = makeMockSocket({
      commandAck: () => ({
        protocolVersion: '3',
        commandId: 'cmd-conflict',
        status: 'conflict',
        expectedVersion: 0,
        currentVersion: 7,
        error: {
          code: 'CONFLICT',
          message: 'Room state version changed',
        },
      }),
    });
    session.connect(mock.socket, identity);
    mock.emitter.emit('connect');

    const response = await session.submitCommand({
      protocolVersion: '3',
      commandId: 'cmd-conflict',
      roomId: 'room-test',
      playerId: 'player-test',
      expectedVersion: 0,
      type: 'game.fold',
    });

    expect(response.status).toBe('conflict');
    expect(session.expectedVersion).toBe(7);
  });

  it('rejects an invalid Host acknowledgment without losing commandId', async () => {
    const mock = makeMockSocket({
      commandAck: () => ({ invalid: true }),
    });
    session.connect(mock.socket, identity);
    mock.emitter.emit('connect');

    const response = await session.submitCommand({
      protocolVersion: '3',
      commandId: 'cmd-invalid',
      roomId: 'room-test',
      playerId: 'player-test',
      expectedVersion: 0,
      type: 'game.fold',
    });

    expect(response.status).toBe('rejected');
    expect(response.commandId).toBe('cmd-invalid');
    if (response.status === 'rejected') {
      expect(response.error.code).toBe('INTERNAL_ERROR');
      expect(response.error.details).toEqual({ reason: 'invalid-response' });
    }
  });

  it('times out a pending command and preserves commandId', async () => {
    vi.useFakeTimers();
    const mock = makeMockSocket({ suppressCommandAck: true });
    session.connect(mock.socket, identity);
    mock.emitter.emit('connect');

    const pending = session.submitCommand(
      {
        protocolVersion: '3',
        commandId: 'cmd-timeout',
        roomId: 'room-test',
        playerId: 'player-test',
        expectedVersion: 0,
        type: 'game.fold',
      },
      10,
    );
    await vi.advanceTimersByTimeAsync(10);
    const response = await pending;

    expect(response.status).toBe('rejected');
    expect(response.commandId).toBe('cmd-timeout');
    if (response.status === 'rejected') {
      expect(response.error.details).toEqual({ reason: 'timeout' });
    }
  });

  it('rejects pending commands when the socket disconnects', async () => {
    const mock = makeMockSocket({ suppressCommandAck: true });
    session.connect(mock.socket, identity);
    mock.emitter.emit('connect');

    const pending = session.submitCommand({
      protocolVersion: '3',
      commandId: 'cmd-disconnect',
      roomId: 'room-test',
      playerId: 'player-test',
      expectedVersion: 0,
      type: 'game.fold',
    });
    mock.emitter.emit('disconnect');
    const response = await pending;

    expect(response.status).toBe('rejected');
    expect(response.commandId).toBe('cmd-disconnect');
    if (response.status === 'rejected') {
      expect(response.error.details).toEqual({ reason: 'disconnected' });
    }
  });

  it('nextCommandId generates unique IDs', () => {
    const id1 = session.nextCommandId();
    const id2 = session.nextCommandId();
    expect(id1).not.toBe(id2);
  });

  it('nextCommandId does not collide between sessions with the same identity', () => {
    const firstMock = makeMockSocket();
    const secondMock = makeMockSocket();
    const secondSession = new PlayerSession();
    session.connect(firstMock.socket, identity);
    secondSession.connect(secondMock.socket, identity);

    const ids = new Set([
      session.nextCommandId(),
      session.nextCommandId(),
      secondSession.nextCommandId(),
      secondSession.nextCommandId(),
    ]);

    expect(ids.size).toBe(4);
  });

  it('disconnect cleans up state', () => {
    const mock = makeMockSocket();
    session.connect(mock.socket, identity);
    session.disconnect();
    expect(session.state).toBe('left');
    expect(session.snapshot).toBeNull();
    expect(session.playerId).toBeNull();
    expect(session.roomId).toBeNull();
  });

  it('isMyTurn false when not currentActor', () => {
    const mock = makeMockSocket();
    session.connect(mock.socket, identity);
    mock.emitter.emit('connect');
    const snapshot = makeSnapshot({
      game: { ...makeSnapshot().game, currentActorId: 'other-player' },
    });
    mock.emitter.emit('state:snapshot', snapshot);
    expect(session.isMyTurn).toBe(false);
  });

  it('needsHandReady when ownChoice is pending', () => {
    const mock = makeMockSocket();
    session.connect(mock.socket, identity);
    mock.emitter.emit('connect');
    const snapshot = makeSnapshot({
      room: { ...makeSnapshot().room, phase: 'hand-ready' },
      game: null,
      handReady: {
        deadlineMs: Date.now() + 30_000,
        ownChoice: 'pending' as const,
        pendingRequests: [],
      },
    });
    mock.emitter.emit('state:snapshot', snapshot);
    expect(session.needsHandReady).toBe(true);
  });

  it('needsHandReady false when ownChoice is ready', () => {
    const mock = makeMockSocket();
    session.connect(mock.socket, identity);
    const snapshot = makeSnapshot({
      room: { ...makeSnapshot().room, phase: 'hand-ready' },
      game: null,
      handReady: {
        deadlineMs: Date.now() + 30_000,
        ownChoice: 'ready' as const,
        pendingRequests: [],
      },
    });
    mock.emitter.emit('state:snapshot', snapshot);
    expect(session.needsHandReady).toBe(false);
  });

  it('allows a timed-out sitting-out player to become ready again', () => {
    const mock = makeMockSocket();
    session.connect(mock.socket, identity);
    mock.emitter.emit('connect');
    mock.emitter.emit(
      'state:snapshot',
      makeSnapshot({
        room: { ...makeSnapshot().room, phase: 'hand-ready' },
        game: {
          ...makeSnapshot().game,
          handId: 'settled-hand',
          currentActorId: null,
        },
        handReady: {
          deadlineMs: 1_000,
          ownChoice: 'sitting-out' as const,
          pendingRequests: [],
        },
      }),
    );

    expect(session.needsHandReady).toBe(true);
  });

  it('suppresses repeated hand-ready prompts for an acknowledged choice', () => {
    const mock = makeMockSocket();
    session.connect(mock.socket, identity);
    mock.emitter.emit('connect');
    mock.emitter.emit(
      'state:snapshot',
      makeSnapshot({
        room: { ...makeSnapshot().room, phase: 'hand-ready' },
        game: {
          ...makeSnapshot().game,
          handId: 'settled-hand',
          currentActorId: null,
        },
        handReady: {
          deadlineMs: 1_000,
          ownChoice: 'sitting-out' as const,
          pendingRequests: [],
        },
      }),
    );

    session.markHandReadyChoicePending(2, 'sitting-out');
    expect(session.needsHandReady).toBe(false);

    mock.emitter.emit(
      'state:snapshot',
      makeSnapshot({
        sequence: 2,
        stateVersion: 2,
        room: { ...makeSnapshot().room, phase: 'hand-ready' },
        game: {
          ...makeSnapshot().game,
          handId: 'settled-hand',
          currentActorId: null,
        },
        handReady: {
          deadlineMs: 1_000,
          ownChoice: 'sitting-out' as const,
          pendingRequests: [],
        },
      }),
    );

    expect(session.needsHandReady).toBe(false);
  });

  it('prompts again when a new hand-ready window restores sitting-out', () => {
    const mock = makeMockSocket();
    session.connect(mock.socket, identity);
    mock.emitter.emit('connect');
    mock.emitter.emit(
      'state:snapshot',
      makeSnapshot({
        room: { ...makeSnapshot().room, phase: 'hand-ready' },
        game: {
          ...makeSnapshot().game,
          handId: 'settled-hand',
          currentActorId: null,
        },
        handReady: {
          deadlineMs: 1_000,
          ownChoice: 'sitting-out' as const,
          pendingRequests: [],
        },
      }),
    );
    session.markHandReadyChoicePending(2, 'sitting-out');

    mock.emitter.emit(
      'state:snapshot',
      makeSnapshot({
        sequence: 2,
        stateVersion: 2,
        room: { ...makeSnapshot().room, phase: 'hand-ready' },
        game: {
          ...makeSnapshot().game,
          handId: 'next-settled-hand',
          currentActorId: null,
        },
        handReady: {
          deadlineMs: 31_000,
          ownChoice: 'sitting-out' as const,
          pendingRequests: [],
        },
      }),
    );

    expect(session.needsHandReady).toBe(true);
  });

  it('ignores invalid snapshot data', () => {
    const mock = makeMockSocket();
    session.connect(mock.socket, identity);
    mock.emitter.emit('connect');
    mock.emitter.emit('state:snapshot', { invalid: true });
    expect(session.snapshot).toBeNull();
  });

  it('suppresses lobby-ready prompts while the accepted version is pending', () => {
    const mock = makeMockSocket();
    session.connect(mock.socket, identity);
    mock.emitter.emit('connect');
    mock.emitter.emit(
      'state:snapshot',
      makeSnapshot({
        room: { ...makeSnapshot().room, phase: 'lobby' },
        game: null,
      }),
    );
    expect(session.needsLobbyReady).toBe(true);

    session.markLobbyReadyPending(2);
    expect(session.lobbyReadyPendingVersion).toBe(2);
    expect(session.needsLobbyReady).toBe(false);

    mock.emitter.emit(
      'state:snapshot',
      makeSnapshot({
        sequence: 2,
        stateVersion: 2,
        room: {
          ...makeSnapshot().room,
          phase: 'lobby',
          players: [
            {
              ...makeSnapshot().room.players[0],
              lobbyReady: false,
            },
          ],
        },
        game: null,
      }),
    );

    expect(session.lobbyReadyPendingVersion).toBeNull();
    expect(session.needsLobbyReady).toBe(true);
  });
});
