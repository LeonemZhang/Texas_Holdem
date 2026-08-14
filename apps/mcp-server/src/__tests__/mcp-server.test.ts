import { EventEmitter } from 'node:events';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import type { PlayerSnapshot } from '@texas-holdem/protocol';
import type { Socket } from 'socket.io-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createPokerMcpServer,
  type PokerMcpServerDependencies,
} from '../mcp-server.js';
import { PlayerSession, type SessionIdentity } from '../session.js';

const hostUrl = 'http://127.0.0.1:32100';
const identity: SessionIdentity = {
  roomId: 'room-1',
  playerId: 'player-1',
  sessionToken: 'token-1234567890123456',
};

interface SocketHarness {
  readonly socket: Socket;
  readonly emitter: EventEmitter;
  readonly commands: Array<Record<string, unknown>>;
  readonly connected: () => boolean;
  readonly disconnect: () => void;
}

function makeSocket(
  commandAck: (command: Record<string, unknown>) => unknown = acceptedResponse,
): SocketHarness {
  const emitter = new EventEmitter();
  const commands: Array<Record<string, unknown>> = [];
  let connected = true;
  const socket = {
    get connected() {
      return connected;
    },
    on: (event: string, listener: (...args: unknown[]) => void) => {
      emitter.on(event, (...args: unknown[]) => listener(...args));
      return socket as Socket;
    },
    emit: (event: string, ...args: unknown[]) => {
      if (event === 'command:submit') {
        const command = args[0] as Record<string, unknown>;
        commands.push(command);
        const ack = args[1] as ((response: unknown) => void) | undefined;
        ack?.(commandAck(command));
      }
      emitter.emit(event, ...args);
      return socket as Socket;
    },
    removeAllListeners: () => {
      emitter.removeAllListeners();
      return socket as Socket;
    },
    disconnect: () => {
      connected = false;
      emitter.emit('disconnect');
      return socket as Socket;
    },
  } as unknown as Socket;

  return {
    socket,
    emitter,
    commands,
    connected: () => connected,
    disconnect: () => socket.disconnect(),
  };
}

function acceptedResponse(
  command: Record<string, unknown>,
  stateVersion = 2,
  sequence = 2,
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

function makeSnapshot(overrides: Record<string, unknown> = {}): PlayerSnapshot {
  const base = {
    protocolVersion: '3',
    roomId: identity.roomId,
    playerId: identity.playerId,
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
          playerId: identity.playerId,
          nickname: 'AI',
          seatIndex: 0,
          chips: 980,
          streetCommitted: 20,
          totalCommitted: 20,
          status: 'active',
          isHost: false,
          lobbyReady: false,
        },
      ],
    },
    game: {
      handId: 'hand-1',
      street: 'preflop',
      buttonPlayerId: identity.playerId,
      smallBlindPlayerId: identity.playerId,
      bigBlindPlayerId: identity.playerId,
      currentActorId: identity.playerId,
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
      actionDeadlineMs: Date.now() + 30_000,
    },
    handReady: null,
    chipRequests: [],
    chipActivity: [],
    statistics: { players: [], titles: [] },
    ...overrides,
  };
  return base as unknown as PlayerSnapshot;
}

async function connectClient(server: ReturnType<typeof createPokerMcpServer>) {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: 'test-client', version: '1.0.0' },
    { capabilities: {} },
  );
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}

async function callTool(
  client: Client,
  name: string,
  arguments_: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const result = (await client.callTool(
    { name, arguments: arguments_ },
    CallToolResultSchema,
  )) as { readonly content: unknown[] };
  const first = result.content[0];
  if (
    typeof first !== 'object' ||
    first === null ||
    !('type' in first) ||
    first.type !== 'text' ||
    !('text' in first) ||
    typeof first.text !== 'string'
  ) {
    throw new Error('Expected a text tool result');
  }
  return JSON.parse(first.text) as Record<string, unknown>;
}

const activeTools: Array<{
  readonly client: Client;
  readonly server: ReturnType<typeof createPokerMcpServer>;
  readonly session: PlayerSession;
  readonly harness?: SocketHarness;
}> = [];

afterEach(async () => {
  for (const active of activeTools.splice(0)) {
    active.session.disconnect();
    await active.client.close();
    await active.server.close();
  }
  vi.unstubAllGlobals();
});

describe('MCP tools', () => {
  it('resumes with the supplied playerId and exposes the first snapshot', async () => {
    const bootstrap = {
      protocolVersion: '3' as const,
      serverVersion: '1.0.4',
      serverTime: new Date(0).toISOString(),
      connection: {
        host: '127.0.0.1',
        port: 32100,
        joinUrl: hostUrl,
        socketPath: '/socket.io',
      },
    };
    let harness: SocketHarness | null = null;
    const dependencies = {
      fetchBootstrap: vi.fn(async () => bootstrap),
      joinRoom: vi.fn(async () => identity),
      resumeRoom: vi.fn(async () => identity),
      connectSocket: vi.fn(() => {
        const nextHarness = makeSocket();
        harness = nextHarness;
        queueMicrotask(() => {
          nextHarness.emitter.emit('state:snapshot', makeSnapshot());
        });
        return nextHarness.socket;
      }),
    } satisfies Partial<PokerMcpServerDependencies>;
    const session = new PlayerSession();
    const server = createPokerMcpServer(session, dependencies);
    const { client } = await connectClient(server);
    activeTools.push({ client, server, session });

    const call = callTool(client, 'poker_connect', {
      hostUrl,
      nickname: 'AI',
      resumeToken: {
        roomId: identity.roomId,
        playerId: identity.playerId,
        token: identity.sessionToken,
      },
    });
    await vi.waitFor(() => {
      expect(harness).not.toBeNull();
    });
    const connected = await call;

    expect(dependencies.resumeRoom).toHaveBeenCalledWith(
      hostUrl,
      identity.roomId,
      identity.playerId,
      identity.sessionToken,
      'AI',
    );
    expect(dependencies.connectSocket).toHaveBeenCalledWith(
      hostUrl,
      identity.roomId,
      identity.playerId,
      identity.sessionToken,
    );
    expect(connected).toMatchObject({
      playerId: identity.playerId,
      roomId: identity.roomId,
      phase: 'playing',
      seatIndex: 0,
    });
    expect(connected.recoveryToken).toEqual({
      roomId: identity.roomId,
      playerId: identity.playerId,
      token: identity.sessionToken,
    });
  });

  it('restores an existing session without requiring or sending a nickname', async () => {
    const bootstrap = {
      protocolVersion: '3' as const,
      serverVersion: '1.0.4',
      serverTime: new Date(0).toISOString(),
      connection: {
        host: '127.0.0.1',
        port: 32100,
        joinUrl: hostUrl,
        socketPath: '/socket.io',
      },
    };
    const dependencies = {
      fetchBootstrap: vi.fn(async () => bootstrap),
      joinRoom: vi.fn(),
      resumeRoom: vi.fn(async () => identity),
      connectSocket: vi.fn(() => {
        const harness = makeSocket();
        queueMicrotask(() => {
          harness.emitter.emit('state:snapshot', makeSnapshot());
        });
        return harness.socket;
      }),
    } satisfies Partial<PokerMcpServerDependencies>;
    const session = new PlayerSession();
    const server = createPokerMcpServer(session, dependencies);
    const { client } = await connectClient(server);
    activeTools.push({ client, server, session });

    await callTool(client, 'poker_connect', {
      hostUrl,
      resumeToken: {
        roomId: identity.roomId,
        playerId: identity.playerId,
        token: identity.sessionToken,
      },
    });

    expect(dependencies.resumeRoom).toHaveBeenCalledWith(
      hostUrl,
      identity.roomId,
      identity.playerId,
      identity.sessionToken,
      undefined,
    );
    expect(dependencies.joinRoom).not.toHaveBeenCalled();
  });

  it('poker_observe returns the expanded player view', async () => {
    const harness = makeSocket();
    const session = new PlayerSession();
    session.connect(harness.socket, identity);
    harness.emitter.emit('connect');
    harness.emitter.emit('state:snapshot', makeSnapshot());
    const server = createPokerMcpServer(session);
    const { client } = await connectClient(server);
    activeTools.push({ client, server, session, harness });

    const result = await callTool(client, 'poker_observe');

    expect(result).toMatchObject({
      roomId: identity.roomId,
      playerId: identity.playerId,
      sequence: 1,
      stateVersion: 1,
      expectedVersion: 1,
      completedHands: 0,
      handId: 'hand-1',
      mySeatIndex: 0,
      myLobbyReady: false,
      myStreetCommitted: 20,
      myTotalCommitted: 20,
    });
    expect(result.players).toEqual([
      expect.objectContaining({
        playerId: identity.playerId,
        seatIndex: 0,
        lobbyReady: false,
        streetCommitted: 20,
        totalCommitted: 20,
      }),
    ]);
  });

  it('poker_lobby_ready retries conflict and suppresses duplicate submissions', async () => {
    let ackCount = 0;
    const harness = makeSocket((command) => {
      ackCount += 1;
      if (ackCount === 1) {
        return {
          protocolVersion: '3',
          commandId: command.commandId,
          status: 'conflict',
          expectedVersion: 1,
          currentVersion: 7,
          error: {
            code: 'CONFLICT',
            message: 'Room state version changed',
          },
        };
      }
      return acceptedResponse(command, 8, 8);
    });
    const session = new PlayerSession();
    session.connect(harness.socket, identity);
    harness.emitter.emit('connect');
    harness.emitter.emit(
      'state:snapshot',
      makeSnapshot({
        room: {
          ...makeSnapshot().room,
          phase: 'lobby',
        },
        game: null,
      }),
    );
    const server = createPokerMcpServer(session);
    const { client } = await connectClient(server);
    activeTools.push({ client, server, session, harness });

    const first = await callTool(client, 'poker_lobby_ready');
    const second = await callTool(client, 'poker_lobby_ready');

    expect(first).toMatchObject({
      accepted: true,
      status: 'accepted',
      stateVersion: 8,
      sequence: 8,
    });
    expect(first.details).toMatchObject({ conflictRetries: 1 });
    expect(second).toMatchObject({
      accepted: false,
      status: 'rejected',
      error: { code: 'NOT_LOBBY' },
    });
    expect(harness.commands).toHaveLength(2);
    expect(harness.commands[0]).toMatchObject({
      type: 'room.set-lobby-ready',
      ready: true,
      expectedVersion: 1,
    });
    expect(harness.commands[1]).toMatchObject({
      type: 'room.set-lobby-ready',
      ready: true,
      expectedVersion: 7,
    });

    harness.emitter.emit(
      'state:snapshot',
      makeSnapshot({
        sequence: 8,
        stateVersion: 8,
        room: {
          ...makeSnapshot().room,
          phase: 'lobby',
        },
        game: null,
      }),
    );
    expect(session.needsLobbyReady).toBe(true);
  });

  it('allows an AI player to re-ready after the hand-ready deadline', async () => {
    const harness = makeSocket();
    const session = new PlayerSession();
    session.connect(harness.socket, identity);
    harness.emitter.emit('connect');
    harness.emitter.emit(
      'state:snapshot',
      makeSnapshot({
        room: {
          ...makeSnapshot().room,
          phase: 'hand-ready',
        },
        game: null,
        handReady: {
          deadlineMs: 1_000,
          ownChoice: 'sitting-out',
          pendingRequests: [],
        },
      }),
    );
    const server = createPokerMcpServer(session);
    const { client } = await connectClient(server);
    activeTools.push({ client, server, session, harness });

    const result = await callTool(client, 'poker_submit_hand_ready', {
      choice: 'ready',
    });

    expect(result).toMatchObject({
      accepted: true,
      status: 'accepted',
      stateVersion: 2,
      sequence: 2,
    });
    expect(harness.commands).toHaveLength(1);
    expect(harness.commands[0]).toMatchObject({
      type: 'hand-ready.set-choice',
      choice: 'ready',
    });
  });

  it('poker_leave reports Host acceptance and disconnects', async () => {
    const harness = makeSocket((command) => acceptedResponse(command, 3, 3));
    const session = new PlayerSession();
    session.connect(harness.socket, identity);
    harness.emitter.emit('connect');
    harness.emitter.emit('state:snapshot', makeSnapshot());
    const server = createPokerMcpServer(session);
    const { client } = await connectClient(server);
    activeTools.push({ client, server, session, harness });

    const result = await callTool(client, 'poker_leave');

    expect(result).toMatchObject({
      accepted: true,
      status: 'accepted',
      disconnected: true,
      stateVersion: 3,
      sequence: 3,
    });
    expect(session.state).toBe('left');
    expect(harness.connected()).toBe(false);
  });
});
