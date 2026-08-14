import { PROTOCOL_VERSION, type DomainEvent } from '@texas-holdem/protocol';

import { APP_VERSION } from './app-version.js';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io as createSocketClient } from 'socket.io-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { persistCommandOutcome } from './application/persist-command-outcome.js';
import { InMemorySessionAuthenticator } from './application/session-authenticator.js';
import { GameRuntime } from './application/game-runtime.js';
import { CommandDispatcher } from './application/command-dispatcher.js';
import type { PersistenceUnitOfWork } from './application/persistence-ports.js';
import { InMemoryRoomRegistry } from './application/room-registry.js';
import { projectPlayerSnapshot } from './application/snapshot-projector.js';
import { InMemoryEventBuffer } from './application/event-buffer.js';
import { ReconnectSynchronizer } from './application/reconnect-synchronizer.js';
import { createRoom, freezeRoom } from './domain/room.js';
import { joinRoom } from './domain/join-room.js';
import { setLobbyReady } from './domain/lobby-ready.js';
import { startFirstHand } from './domain/start-first-hand.js';
import { HOST_MIGRATIONS } from './persistence/migrations.js';
import {
  openSqliteDatabase,
  runSqliteMigrations,
} from './persistence/sqlite-database.js';
import { SqliteTransactionStore } from './persistence/sqlite-event-command-store.js';
import { createHostServer, type HostServer } from './server.js';

let activeHost: HostServer | undefined;

afterEach(async () => {
  if (activeHost) {
    await activeHost.close();
    activeHost = undefined;
  }
});

type PersistenceFailure = 'none' | 'before-commit' | 'commit';

function createPersistenceProbe(
  database: ReturnType<typeof openSqliteDatabase>,
  failure: PersistenceFailure,
  order: string[],
) {
  database.exec(`
    CREATE TABLE acknowledgement_probe (
      kind TEXT NOT NULL,
      value TEXT NOT NULL
    ) STRICT
  `);
  const stores: PersistenceUnitOfWork = {
    events: {
      append(events) {
        for (const event of events) {
          order.push('event-write');
          database
            .prepare(
              'INSERT INTO acknowledgement_probe (kind, value) VALUES (?, ?)',
            )
            .run('event', event.eventId);
        }
      },
      readAfter: () => [],
      latestSequence: () => 0,
    },
    snapshots: {
      save: () => undefined,
      latest: () => null,
    },
    commands: {
      find: () => null,
      save(result) {
        order.push('command-write');
        database
          .prepare(
            'INSERT INTO acknowledgement_probe (kind, value) VALUES (?, ?)',
          )
          .run('command', result.commandId);
        if (failure === 'before-commit') {
          throw new Error('simulated persistence failure before commit');
        }
      },
    },
  };
  const realExec = database.exec.bind(database);
  const execSpy = vi.spyOn(database, 'exec').mockImplementation((sql) => {
    if (sql === 'BEGIN IMMEDIATE') order.push('begin');
    if (sql === 'COMMIT') {
      order.push('commit');
      if (failure === 'commit') {
        throw new Error('simulated commit failure');
      }
    }
    if (sql === 'ROLLBACK') order.push('rollback');
    return realExec(sql);
  });
  const transactions = new SqliteTransactionStore(database, stores);
  return {
    execSpy,
    persist: (input: Parameters<typeof persistCommandOutcome>[1]) =>
      persistCommandOutcome(transactions, input),
    markerCount: () => {
      const row = database
        .prepare('SELECT COUNT(*) AS count FROM acknowledgement_probe')
        .get() as unknown as { readonly count: number };
      return row.count;
    },
  };
}

async function exercisePersistenceAcknowledgement(failure: PersistenceFailure) {
  const runtime = new GameRuntime();
  const session = runtime.create(
    {
      hostNickname: 'Alice',
      settings: {
        roomName: 'Persistence order',
        maxPlayers: 2,
        initialChips: 100,
        smallBlind: 1,
        actionTimeoutSeconds: 30,
        handReadyTimeoutSeconds: 30,
        blindGrowth: { enabled: false, intervalHands: 10, multiplier: 2 },
        zeroChipPolicy: 'request-chips',
      },
    },
    'http://127.0.0.1:32100',
  );
  const database = openSqliteDatabase(':memory:');
  runSqliteMigrations(database, HOST_MIGRATIONS);
  const order: string[] = [];
  const probe = createPersistenceProbe(database, failure, order);
  const commandId = `persistence-${failure}`;
  const stopPersistence = runtime.onStateCommitted((roomId) => {
    const state = runtime.exportState(roomId);
    if (!state) throw new Error('Missing committed runtime state');
    const event: DomainEvent = {
      protocolVersion: PROTOCOL_VERSION,
      eventId: `${commandId}-event`,
      roomId,
      sequence: state.sequence,
      stateVersion: state.room.version,
      type: 'room.control-changed',
      phase: 'closed',
      normalClose: true,
    };
    probe.persist({
      roomId,
      playerId: session.playerId,
      commandId,
      response: {
        protocolVersion: PROTOCOL_VERSION,
        commandId,
        status: 'accepted',
        stateVersion: state.room.version,
        sequence: state.sequence,
      },
      events: [event],
    });
    order.push('persistence-return');
  });
  activeHost = await createHostServer({
    commandDispatcher: runtime,
    sessionAuthenticator: runtime,
  });
  const address = await activeHost.app.listen({ host: '127.0.0.1', port: 0 });
  const client = createSocketClient(address, {
    autoConnect: false,
    transports: ['websocket'],
    auth: {
      ...session,
    },
  });
  try {
    const response = await new Promise<unknown>((resolve, reject) => {
      client.on('connect_error', reject);
      client.emit(
        'command:submit',
        {
          protocolVersion: PROTOCOL_VERSION,
          commandId,
          roomId: session.roomId,
          playerId: session.playerId,
          expectedVersion: 0,
          type: 'room.close',
        },
        (acknowledgement: unknown) => {
          order.push('ack');
          resolve(acknowledgement);
        },
      );
      client.connect();
    });
    return {
      response,
      order,
      markerCount: probe.markerCount(),
    };
  } finally {
    client.disconnect();
    stopPersistence();
    probe.execSpy.mockRestore();
    database.close();
  }
}

describe('host framework server', () => {
  it('creates and joins a room through HTTP then sends the authenticated snapshot', async () => {
    const runtime = new GameRuntime();
    const roomSnapshotsProvider = vi.fn((roomId: string) =>
      runtime.snapshotsForRoom(roomId),
    );
    activeHost = await createHostServer({
      roomSessionService: runtime,
      commandDispatcher: runtime,
      sessionAuthenticator: runtime,
      reconnectSynchronizer: runtime.reconnect,
      snapshotProvider: (roomId, playerId) =>
        runtime.snapshot(roomId, playerId),
      roomSnapshotsProvider,
    });
    const address = await activeHost.app.listen({ host: '127.0.0.1', port: 0 });
    const created = await activeHost.app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload: {
        hostNickname: 'Alice',
        settings: {
          roomName: 'Friends',
          maxPlayers: 10,
          initialChips: 100,
          smallBlind: 1,
          actionTimeoutSeconds: 30,
          handReadyTimeoutSeconds: 30,
          blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
          zeroChipPolicy: 'request-chips',
        },
      },
    });
    expect(created.statusCode).toBe(200);
    const hostSession = created.json<{
      roomId: string;
      playerId: string;
      token: string;
    }>();
    const currentRoom = await activeHost.app.inject({
      method: 'GET',
      url: '/api/rooms/current',
    });
    expect(currentRoom.json()).toMatchObject({ roomId: hostSession.roomId });
    const joined = await activeHost.app.inject({
      method: 'POST',
      url: `/api/rooms/${hostSession.roomId}/join`,
      payload: { nickname: 'Bob' },
    });
    expect(joined.statusCode).toBe(200);
    const guestSession = joined.json<{
      roomId: string;
      playerId: string;
      token: string;
    }>();
    expect(roomSnapshotsProvider).toHaveBeenCalledTimes(2);
    expect(roomSnapshotsProvider).toHaveBeenLastCalledWith(hostSession.roomId);
    const client = createSocketClient(address, {
      autoConnect: false,
      transports: ['websocket'],
      auth: {
        protocolVersion: PROTOCOL_VERSION,
        ...guestSession,
      },
    });
    try {
      const received = new Promise<unknown>((resolve, reject) => {
        client.on('connect_error', reject);
        client.on('state:snapshot', resolve);
      });
      client.connect();
      await expect(received).resolves.toMatchObject({
        roomId: hostSession.roomId,
        playerId: guestSession.playerId,
        room: { players: [{ nickname: 'Alice' }, { nickname: 'Bob' }] },
      });
    } finally {
      client.disconnect();
    }
  });

  it('sends a service-only Host session through its private Host snapshot channel', async () => {
    const runtime = new GameRuntime();
    activeHost = await createHostServer({
      roomSessionService: runtime,
      commandDispatcher: runtime,
      sessionAuthenticator: runtime,
      reconnectSynchronizer: runtime.reconnect,
      hostSnapshotProvider: (roomId, hostId) =>
        runtime.hostSnapshot(roomId, hostId),
      hostSnapshotsProvider: (roomId) => runtime.hostSnapshotsForRoom(roomId),
    });
    const created = await activeHost.app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload: {
        hostNickname: 'Service Host',
        hostParticipation: 'service-only',
        settings: {
          roomName: 'Service table',
          maxPlayers: 4,
          initialChips: 100,
          smallBlind: 1,
          actionTimeoutSeconds: 30,
          handReadyTimeoutSeconds: 30,
          blindGrowth: { enabled: false, intervalHands: 10, multiplier: 2 },
          zeroChipPolicy: 'request-chips',
        },
      },
    });
    expect(created.statusCode).toBe(200);
    const hostSession = created.json<{
      roomId: string;
      playerId: string;
      hostId: string;
      sessionType: 'host';
      token: string;
    }>();
    await activeHost.app.inject({
      method: 'POST',
      url: `/api/rooms/${hostSession.roomId}/join`,
      payload: { nickname: 'Alice' },
    });
    const address = await activeHost.app.listen({ host: '127.0.0.1', port: 0 });
    const client = createSocketClient(address, {
      autoConnect: false,
      transports: ['websocket'],
      auth: {
        protocolVersion: PROTOCOL_VERSION,
        ...hostSession,
      },
    });
    try {
      const received = new Promise<unknown>((resolve, reject) => {
        client.on('connect_error', reject);
        client.on('state:host-snapshot', resolve);
      });
      client.connect();
      await expect(received).resolves.toMatchObject({
        roomId: hostSession.roomId,
        hostId: hostSession.hostId,
        hostParticipation: 'service-only',
        room: { players: [{ nickname: 'Alice' }] },
      });
      client.disconnect();
      expect(runtime.rooms.get(hostSession.roomId)).toMatchObject({
        phase: 'lobby',
        hostParticipation: 'service-only',
      });
      expect(
        runtime.hostSnapshot(hostSession.roomId, hostSession.hostId),
      ).not.toBeNull();
    } finally {
      client.disconnect();
    }
  });

  it('restores a voluntarily departed session through the token-only endpoint', async () => {
    const runtime = new GameRuntime();
    activeHost = await createHostServer({
      roomSessionService: runtime,
      roomSnapshotsProvider: (roomId) => runtime.snapshotsForRoom(roomId),
    });
    const host = runtime.create(
      {
        hostNickname: 'Alice',
        settings: {
          roomName: 'Friends',
          maxPlayers: 10,
          initialChips: 100,
          smallBlind: 1,
          actionTimeoutSeconds: 30,
          handReadyTimeoutSeconds: 30,
          blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
          zeroChipPolicy: 'request-chips',
        },
      },
      'http://127.0.0.1:32100',
    );
    const guest = runtime.join(
      host.roomId,
      { nickname: 'Bob' },
      'http://127.0.0.1:32100',
    );
    runtime.dispatch({
      protocolVersion: PROTOCOL_VERSION,
      commandId: 'guest-exit',
      roomId: host.roomId,
      playerId: guest.playerId,
      expectedVersion: runtime.snapshot(host.roomId, guest.playerId)!
        .stateVersion,
      type: 'room.exit',
    });

    const resumed = await activeHost.app.inject({
      method: 'POST',
      url: `/api/rooms/${host.roomId}/resume`,
      payload: {
        playerId: guest.playerId,
        token: guest.token,
        nickname: 'Bobby',
      },
    });

    expect(resumed.statusCode).toBe(200);
    expect(resumed.json()).toMatchObject({ playerId: guest.playerId });
    expect(
      runtime
        .snapshot(host.roomId, host.playerId)
        ?.room.players.find(({ playerId }) => playerId === guest.playerId),
    ).toMatchObject({ nickname: 'Bobby', chips: 100, status: 'waiting' });
  });

  it('returns a permanent removal error when an in-game player tries to recover', async () => {
    const runtime = new GameRuntime();
    activeHost = await createHostServer({
      roomSessionService: runtime,
      roomSnapshotsProvider: (roomId) => runtime.snapshotsForRoom(roomId),
    });
    const host = runtime.create(
      {
        hostNickname: 'Alice',
        settings: {
          roomName: 'Friends',
          maxPlayers: 10,
          initialChips: 100,
          smallBlind: 1,
          actionTimeoutSeconds: 30,
          handReadyTimeoutSeconds: 30,
          blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
          zeroChipPolicy: 'request-chips',
        },
      },
      'http://127.0.0.1:32100',
    );
    const guest = runtime.join(
      host.roomId,
      { nickname: 'Bob' },
      'http://127.0.0.1:32100',
    );
    let commandNumber = 0;
    const send = (playerId: string, command: Record<string, unknown>) =>
      runtime.dispatch({
        protocolVersion: PROTOCOL_VERSION,
        commandId: `remove-flow-${++commandNumber}`,
        roomId: host.roomId,
        playerId,
        expectedVersion: runtime.snapshot(host.roomId, playerId)!.stateVersion,
        ...command,
      });
    send(guest.playerId, { type: 'room.set-lobby-ready', ready: true });
    send(host.playerId, {
      type: 'room.start-first-hand',
      handId: 'remove-flow-hand',
    });
    const actorId = runtime.snapshot(host.roomId, host.playerId)!.game!
      .currentActorId!;
    send(actorId, { type: 'game.fold' });
    send(host.playerId, {
      type: 'room.remove-player',
      targetPlayerId: guest.playerId,
    });

    const response = await activeHost.app.inject({
      method: 'POST',
      url: `/api/rooms/${host.roomId}/resume`,
      payload: { playerId: guest.playerId, token: guest.token },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: {
        code: 'PLAYER_REMOVED',
        message: '你已被房主移出房间，无法重新加入本场对局。',
      },
    });
  });

  it('returns a Chinese active-room conflict with the running room id', async () => {
    const runtime = new GameRuntime();
    activeHost = await createHostServer({ roomSessionService: runtime });
    const payload = {
      hostNickname: 'Alice',
      settings: {
        roomName: 'Friends',
        maxPlayers: 10,
        initialChips: 100,
        smallBlind: 1,
        actionTimeoutSeconds: 30,
        handReadyTimeoutSeconds: 30,
        blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
        zeroChipPolicy: 'request-chips',
      },
    };
    const created = await activeHost.app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload,
    });
    const firstRoomId = created.json<{ roomId: string }>().roomId;

    const conflict = await activeHost.app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload,
    });

    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({
      error: {
        code: 'ROOM_ALREADY_RUNNING',
        message: '本机已有进行中的对局，请恢复或关闭后再创建。',
        roomId: firstRoomId,
      },
    });
  });

  it('returns a versioned health response', async () => {
    activeHost = await createHostServer();

    const response = await activeHost.app.inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      protocolVersion: PROTOCOL_VERSION,
      serverVersion: APP_VERSION,
      connection: {
        host: '127.0.0.1',
        port: 32100,
        joinUrl: 'http://127.0.0.1:32100',
        socketPath: '/socket.io',
      },
    });
  });

  it('returns a recommended nickname during detection without changing join semantics', async () => {
    const runtime = new GameRuntime();
    activeHost = await createHostServer({ roomSessionService: runtime });
    const created = await activeHost.app.inject({
      method: 'POST',
      url: '/api/rooms',
      payload: {
        hostNickname: 'Alice',
        settings: {
          roomName: 'Friends',
          maxPlayers: 10,
          initialChips: 100,
          smallBlind: 1,
          actionTimeoutSeconds: 30,
          handReadyTimeoutSeconds: 30,
          blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
          zeroChipPolicy: 'request-chips',
        },
      },
    });
    const roomId = created.json<{ roomId: string }>().roomId;

    const probe = await activeHost.app.inject({
      method: 'GET',
      url: '/api/rooms/current?nickname=Alice',
    });
    expect(probe.statusCode).toBe(200);
    expect(probe.json()).toMatchObject({
      protocolVersion: PROTOCOL_VERSION,
      roomId,
      nickname: 'Bob',
    });

    const duplicateJoin = await activeHost.app.inject({
      method: 'POST',
      url: `/api/rooms/${roomId}/join`,
      payload: { nickname: 'Alice' },
    });
    expect(duplicateJoin.statusCode).toBe(409);
    expect(duplicateJoin.json()).toMatchObject({
      error: { message: 'Nickname already exists: Alice' },
    });
    expect(
      runtime.snapshot(roomId, created.json<{ playerId: string }>().playerId)
        ?.room.players,
    ).toHaveLength(1);
  });

  it('reports the actual listen port and advertised LAN join address', async () => {
    activeHost = await createHostServer({ advertisedHost: '10.126.126.1' });
    await activeHost.app.listen({ host: '127.0.0.1', port: 0 });
    const address = activeHost.app.server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing TCP address');

    const health = await activeHost.app.inject({
      method: 'GET',
      url: '/health',
    });
    const bootstrap = await activeHost.app.inject({
      method: 'GET',
      url: '/api/bootstrap',
    });

    expect(health.json().connection).toEqual({
      host: '10.126.126.1',
      port: address.port,
      joinUrl: `http://10.126.126.1:${address.port}`,
      socketPath: '/socket.io',
    });
    expect(bootstrap.json()).toMatchObject({
      protocolVersion: PROTOCOL_VERSION,
      connection: health.json().connection,
    });
  });

  it('uses the incoming IPv4 host for player session join URLs', async () => {
    const runtime = new GameRuntime();
    activeHost = await createHostServer({
      advertisedHost: '192.168.3.121',
      roomSessionService: runtime,
      roomSnapshotsProvider: (roomId) => runtime.snapshotsForRoom(roomId),
    });
    const payload = {
      hostNickname: 'Alice',
      settings: {
        roomName: 'Friends',
        maxPlayers: 10,
        initialChips: 100,
        smallBlind: 1,
        actionTimeoutSeconds: 30,
        handReadyTimeoutSeconds: 30,
        blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
        zeroChipPolicy: 'request-chips',
      },
    };
    const created = await activeHost.app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: { host: '192.168.3.121:32100' },
      payload,
    });
    const hostSession = created.json<{ roomId: string }>();

    const joined = await activeHost.app.inject({
      method: 'POST',
      url: `/api/rooms/${hostSession.roomId}/join`,
      headers: { host: '10.126.126.1:32100' },
      payload: { nickname: 'Bob' },
    });

    expect(joined.statusCode).toBe(200);
    expect(joined.json()).toMatchObject({
      roomId: hostSession.roomId,
      joinUrl: `http://10.126.126.1:32100/?room=${hostSession.roomId}`,
      socketPath: '/socket.io',
    });
  });

  it('serves a built client directory when supplied', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'texas-holdem-client-'));
    await writeFile(join(directory, 'index.html'), '<h1>client smoke</h1>');

    try {
      activeHost = await createHostServer({ staticDirectory: directory });
      const response = await activeHost.app.inject({ method: 'GET', url: '/' });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain('client smoke');
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it('acknowledges a valid Socket.IO system hello', async () => {
    activeHost = await createHostServer();
    const address = await activeHost.app.listen({ host: '127.0.0.1', port: 0 });
    const client = createSocketClient(address, {
      transports: ['websocket'],
    });

    try {
      const response = await new Promise<unknown>((resolve, reject) => {
        client.on('connect_error', reject);
        client.emit(
          'system:hello',
          { protocolVersion: PROTOCOL_VERSION },
          resolve,
        );
      });

      expect(response).toMatchObject({
        protocolVersion: PROTOCOL_VERSION,
        serverVersion: APP_VERSION,
      });
    } finally {
      client.disconnect();
    }
  });

  it('binds business command acknowledgements to the authenticated identity', async () => {
    const sessions = new InMemorySessionAuthenticator();
    sessions.register(
      { roomId: 'room-1', playerId: 'host' },
      'host-secret-token',
    );
    const dispatch = vi.fn(() => ({
      protocolVersion: PROTOCOL_VERSION,
      commandId: 'command-1',
      status: 'accepted' as const,
      stateVersion: 1,
      sequence: 1,
    }));
    activeHost = await createHostServer({
      sessionAuthenticator: sessions,
      commandDispatcher: { dispatch },
    });
    const address = await activeHost.app.listen({ host: '127.0.0.1', port: 0 });
    const client = createSocketClient(address, {
      transports: ['websocket'],
      auth: {
        protocolVersion: PROTOCOL_VERSION,
        roomId: 'room-1',
        playerId: 'host',
        token: 'host-secret-token',
      },
    });

    try {
      const response = await new Promise<unknown>((resolve, reject) => {
        client.on('connect_error', reject);
        client.emit(
          'command:submit',
          {
            protocolVersion: PROTOCOL_VERSION,
            commandId: 'command-1',
            roomId: 'room-1',
            playerId: 'host',
            expectedVersion: 0,
            type: 'room.pause',
          },
          resolve,
        );
      });
      expect(response).toMatchObject({
        status: 'accepted',
        commandId: 'command-1',
      });
      expect(dispatch).toHaveBeenCalledTimes(1);
    } finally {
      client.disconnect();
    }
  });

  it('acknowledges a command only after the persistence transaction commits', async () => {
    const result = await exercisePersistenceAcknowledgement('none');

    expect(result.response).toMatchObject({
      status: 'accepted',
      commandId: 'persistence-none',
    });
    expect(result.order).toEqual([
      'begin',
      'event-write',
      'command-write',
      'commit',
      'persistence-return',
      'ack',
    ]);
    expect(result.markerCount).toBe(2);
  });

  it('does not acknowledge success when persistence fails before commit', async () => {
    const result = await exercisePersistenceAcknowledgement('before-commit');

    expect(result.response).toMatchObject({
      status: 'rejected',
      commandId: 'persistence-before-commit',
    });
    expect(result.response).not.toMatchObject({ status: 'accepted' });
    expect(result.order).toEqual([
      'begin',
      'event-write',
      'command-write',
      'rollback',
      'ack',
    ]);
    expect(result.markerCount).toBe(0);
  });

  it('does not acknowledge success when the SQLite commit fails', async () => {
    const result = await exercisePersistenceAcknowledgement('commit');

    expect(result.response).toMatchObject({
      status: 'rejected',
      commandId: 'persistence-commit',
    });
    expect(result.response).not.toMatchObject({ status: 'accepted' });
    expect(result.order).toEqual([
      'begin',
      'event-write',
      'command-write',
      'commit',
      'rollback',
      'ack',
    ]);
    expect(result.markerCount).toBe(0);
  });

  it('pushes the caller a fresh snapshot before acknowledging a version conflict', async () => {
    const sessions = new InMemorySessionAuthenticator();
    sessions.register(
      { roomId: 'room-1', playerId: 'host' },
      'host-secret-token',
    );
    const room = freezeRoom({
      ...createRoom({
        roomId: 'room-1',
        hostPlayerId: 'host',
        hostNickname: 'Alice',
        settings: {
          roomName: 'Friends',
          maxPlayers: 10,
          initialChips: 100,
          blind: { kind: 'preset', smallBlind: 1 },
          actionTimeoutSeconds: 30,
          handReadyTimeoutSeconds: 30,
          blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
          zeroChipPolicy: 'request-chips',
        },
      }),
      version: 1,
    });
    activeHost = await createHostServer({
      sessionAuthenticator: sessions,
      commandDispatcher: {
        dispatch: vi.fn(() => ({
          protocolVersion: PROTOCOL_VERSION,
          commandId: 'conflict-1',
          status: 'conflict' as const,
          expectedVersion: 0,
          currentVersion: 1,
          error: { code: 'CONFLICT' as const, message: 'Room state changed' },
        })),
      },
      snapshotProvider: (_roomId, playerId) =>
        projectPlayerSnapshot({ room, viewerPlayerId: playerId, sequence: 1 }),
    });
    const address = await activeHost.app.listen({ host: '127.0.0.1', port: 0 });
    const client = createSocketClient(address, {
      autoConnect: false,
      transports: ['websocket'],
      auth: {
        protocolVersion: PROTOCOL_VERSION,
        roomId: 'room-1',
        playerId: 'host',
        token: 'host-secret-token',
      },
    });

    try {
      const initialSnapshot = new Promise<unknown>((resolve, reject) => {
        client.on('connect_error', reject);
        client.once('state:snapshot', resolve);
      });
      client.connect();
      await initialSnapshot;
      const refreshedSnapshot = new Promise<unknown>((resolve) =>
        client.once('state:snapshot', resolve),
      );
      const response = await new Promise<unknown>((resolve) => {
        client.emit(
          'command:submit',
          {
            protocolVersion: PROTOCOL_VERSION,
            commandId: 'conflict-1',
            roomId: 'room-1',
            playerId: 'host',
            expectedVersion: 0,
            type: 'room.pause',
          },
          resolve,
        );
      });

      expect(response).toMatchObject({ status: 'conflict' });
      await expect(refreshedSnapshot).resolves.toMatchObject({
        playerId: 'host',
        stateVersion: 1,
      });
    } finally {
      client.disconnect();
    }
  });

  it('rejects unauthenticated and identity-mismatched business commands', async () => {
    const sessions = new InMemorySessionAuthenticator();
    sessions.register(
      { roomId: 'room-1', playerId: 'host' },
      'host-secret-token',
    );
    const dispatch = vi.fn();
    activeHost = await createHostServer({
      sessionAuthenticator: sessions,
      commandDispatcher: { dispatch },
    });
    const address = await activeHost.app.listen({ host: '127.0.0.1', port: 0 });
    const clients = [
      createSocketClient(address, { transports: ['websocket'] }),
      createSocketClient(address, {
        transports: ['websocket'],
        auth: {
          protocolVersion: PROTOCOL_VERSION,
          roomId: 'room-1',
          playerId: 'host',
          token: 'host-secret-token',
        },
      }),
    ];

    try {
      const responses = await Promise.all(
        clients.map(
          (client, index) =>
            new Promise<unknown>((resolve, reject) => {
              client.on('connect_error', reject);
              client.emit(
                'command:submit',
                {
                  protocolVersion: PROTOCOL_VERSION,
                  commandId: `command-${index}`,
                  roomId: 'room-1',
                  playerId: index === 0 ? 'host' : 'bob',
                  expectedVersion: 0,
                  type: 'room.pause',
                },
                resolve,
              );
            }),
        ),
      );
      expect(responses).toEqual([
        expect.objectContaining({ status: 'unauthorized' }),
        expect.objectContaining({ status: 'unauthorized' }),
      ]);
      expect(dispatch).not.toHaveBeenCalled();
    } finally {
      clients.forEach((client) => client.disconnect());
    }
  });

  it('broadcasts public events but sends private snapshots only to their player', async () => {
    const sessions = new InMemorySessionAuthenticator();
    sessions.register(
      { roomId: 'room-1', playerId: 'host' },
      'host-secret-token',
    );
    sessions.register(
      { roomId: 'room-1', playerId: 'bob' },
      'bob-secret-token-1',
    );
    activeHost = await createHostServer({ sessionAuthenticator: sessions });
    const address = await activeHost.app.listen({ host: '127.0.0.1', port: 0 });
    const client = (playerId: string, token: string) =>
      createSocketClient(address, {
        transports: ['websocket'],
        auth: {
          protocolVersion: PROTOCOL_VERSION,
          roomId: 'room-1',
          playerId,
          token,
        },
      });
    const hostClient = client('host', 'host-secret-token');
    const bobClient = client('bob', 'bob-secret-token-1');

    try {
      await Promise.all(
        [hostClient, bobClient].map(
          (socket) =>
            new Promise<void>((resolve, reject) => {
              socket.on('connect', () => resolve());
              socket.on('connect_error', reject);
            }),
        ),
      );
      const hostEvent = new Promise<unknown>((resolve) =>
        hostClient.once('event:domain', resolve),
      );
      const bobEvent = new Promise<unknown>((resolve) =>
        bobClient.once('event:domain', resolve),
      );
      activeHost.publisher.publishEvent({
        protocolVersion: PROTOCOL_VERSION,
        eventId: 'event-1',
        roomId: 'room-1',
        sequence: 1,
        stateVersion: 1,
        type: 'room.control-changed',
        phase: 'playing',
      });
      expect(await Promise.all([hostEvent, bobEvent])).toEqual([
        expect.objectContaining({ eventId: 'event-1' }),
        expect.objectContaining({ eventId: 'event-1' }),
      ]);

      let room = createRoom({
        roomId: 'room-1',
        hostPlayerId: 'host',
        hostNickname: 'Alice',
        settings: {
          roomName: 'Friends',
          maxPlayers: 10,
          initialChips: 100,
          blind: { kind: 'preset', smallBlind: 1 },
          actionTimeoutSeconds: 30,
          handReadyTimeoutSeconds: 30,
          blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
          zeroChipPolicy: 'request-chips',
        },
      });
      room = joinRoom(room, { playerId: 'bob', nickname: 'Bob' });
      room = setLobbyReady(room, 'host', true);
      room = setLobbyReady(room, 'bob', true);
      const started = startFirstHand(room, 'host', 'hand-1', {
        next: () => 0.5,
      });
      const hostSnapshot = new Promise<unknown>((resolve) =>
        hostClient.once('state:snapshot', resolve),
      );
      const bobSnapshot = new Promise<unknown>((resolve) =>
        bobClient.once('state:snapshot', resolve),
      );
      activeHost.publisher.publishSnapshot(
        projectPlayerSnapshot({
          room: started.room,
          viewerPlayerId: 'host',
          sequence: 1,
          hand: started.hand,
        }),
      );
      activeHost.publisher.publishSnapshot(
        projectPlayerSnapshot({
          room: started.room,
          viewerPlayerId: 'bob',
          sequence: 1,
          hand: started.hand,
        }),
      );
      const [hostState, bobState] = (await Promise.all([
        hostSnapshot,
        bobSnapshot,
      ])) as [
        { playerId: string; game: { ownHoleCards: string[] } },
        { playerId: string; game: { ownHoleCards: string[] } },
      ];
      expect(hostState.playerId).toBe('host');
      expect(bobState.playerId).toBe('bob');
      expect(hostState.game.ownHoleCards).not.toEqual(
        bobState.game.ownHoleCards,
      );
      expect(JSON.stringify(hostState)).not.toContain(
        bobState.game.ownHoleCards[0],
      );
      expect(JSON.stringify(bobState)).not.toContain(
        hostState.game.ownHoleCards[0],
      );
    } finally {
      hostClient.disconnect();
      bobClient.disconnect();
    }
  });

  it('serves continuous reconnect events through the authenticated socket', async () => {
    const sessions = new InMemorySessionAuthenticator();
    sessions.register(
      { roomId: 'room-1', playerId: 'host' },
      'host-secret-token',
    );
    const events = new InMemoryEventBuffer();
    events.append([
      {
        protocolVersion: PROTOCOL_VERSION,
        eventId: 'event-1',
        roomId: 'room-1',
        stateVersion: 1,
        type: 'room.control-changed',
        phase: 'playing',
      },
    ]);
    activeHost = await createHostServer({
      sessionAuthenticator: sessions,
      reconnectSynchronizer: new ReconnectSynchronizer(events, () => null),
    });
    const address = await activeHost.app.listen({ host: '127.0.0.1', port: 0 });
    const client = createSocketClient(address, {
      transports: ['websocket'],
      auth: {
        protocolVersion: PROTOCOL_VERSION,
        roomId: 'room-1',
        playerId: 'host',
        token: 'host-secret-token',
      },
    });

    try {
      const response = await new Promise<unknown>((resolve, reject) => {
        client.on('connect_error', reject);
        client.emit(
          'state:resync',
          {
            protocolVersion: PROTOCOL_VERSION,
            roomId: 'room-1',
            playerId: 'host',
            offset: 0,
          },
          resolve,
        );
      });
      expect(response).toMatchObject({
        status: 'events',
        latestSequence: 1,
        events: [{ eventId: 'event-1', sequence: 1 }],
      });
    } finally {
      client.disconnect();
    }
  });

  it('keeps command idempotency isolated across multiple authenticated sockets', async () => {
    const rooms = new InMemoryRoomRegistry();
    rooms.save(
      createRoom({
        roomId: 'room-1',
        hostPlayerId: 'host',
        hostNickname: 'Alice',
        settings: {
          roomName: 'Friends',
          maxPlayers: 10,
          initialChips: 100,
          blind: { kind: 'preset', smallBlind: 1 },
          actionTimeoutSeconds: 30,
          handReadyTimeoutSeconds: 30,
          blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
          zeroChipPolicy: 'request-chips',
        },
      }),
    );
    const handle = vi.fn(() => ({ stateVersion: 1, sequence: 1 }));
    const dispatcher = new CommandDispatcher(rooms, () => true, handle);
    const sessions = new InMemorySessionAuthenticator();
    sessions.register(
      { roomId: 'room-1', playerId: 'host' },
      'host-secret-token',
    );
    sessions.register(
      { roomId: 'room-1', playerId: 'bob' },
      'bob-secret-token-1',
    );
    activeHost = await createHostServer({
      sessionAuthenticator: sessions,
      commandDispatcher: dispatcher,
    });
    const address = await activeHost.app.listen({ host: '127.0.0.1', port: 0 });
    const connect = (playerId: string, token: string) =>
      createSocketClient(address, {
        transports: ['websocket'],
        auth: {
          protocolVersion: PROTOCOL_VERSION,
          roomId: 'room-1',
          playerId,
          token,
        },
      });
    const hostClient = connect('host', 'host-secret-token');
    const bobClient = connect('bob', 'bob-secret-token-1');
    const submit = (
      client: ReturnType<typeof createSocketClient>,
      playerId: string,
    ) =>
      new Promise<unknown>((resolve, reject) => {
        client.on('connect_error', reject);
        client.emit(
          'command:submit',
          {
            protocolVersion: PROTOCOL_VERSION,
            commandId: 'shared-command-id',
            roomId: 'room-1',
            playerId,
            expectedVersion: 0,
            type: 'room.pause',
          },
          resolve,
        );
      });

    try {
      const responses = await Promise.all([
        submit(hostClient, 'host'),
        submit(hostClient, 'host'),
        submit(bobClient, 'bob'),
        submit(bobClient, 'bob'),
      ]);
      expect(
        responses.every(
          (response) =>
            typeof response === 'object' &&
            response !== null &&
            'status' in response &&
            response.status === 'accepted',
        ),
      ).toBe(true);
      expect(handle).toHaveBeenCalledTimes(2);
    } finally {
      hostClient.disconnect();
      bobClient.disconnect();
    }
  });
});
