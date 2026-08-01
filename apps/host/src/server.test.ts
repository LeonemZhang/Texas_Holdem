import { PROTOCOL_VERSION } from '@texas-holdem/protocol';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io as createSocketClient } from 'socket.io-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemorySessionAuthenticator } from './application/session-authenticator.js';
import { GameRuntime } from './application/game-runtime.js';
import { CommandDispatcher } from './application/command-dispatcher.js';
import { InMemoryRoomRegistry } from './application/room-registry.js';
import { projectPlayerSnapshot } from './application/snapshot-projector.js';
import { InMemoryEventBuffer } from './application/event-buffer.js';
import { ReconnectSynchronizer } from './application/reconnect-synchronizer.js';
import { createRoom } from './domain/room.js';
import { joinRoom } from './domain/join-room.js';
import { setLobbyReady } from './domain/lobby-ready.js';
import { startFirstHand } from './domain/start-first-hand.js';
import { createHostServer, type HostServer } from './server.js';

let activeHost: HostServer | undefined;

afterEach(async () => {
  if (activeHost) {
    await activeHost.close();
    activeHost = undefined;
  }
});

describe('host framework server', () => {
  it('creates and joins a room through HTTP then sends the authenticated snapshot', async () => {
    const runtime = new GameRuntime();
    const roomSnapshotsProvider = vi.fn((roomId: string) =>
      runtime.snapshotsForRoom(roomId),
    );
    activeHost = await createHostServer({
      roomSessionService: runtime,
      commandDispatcher: runtime,
      sessionAuthenticator: runtime.sessions,
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
      serverVersion: '0.0.0',
      connection: {
        host: '127.0.0.1',
        port: 32100,
        joinUrl: 'http://127.0.0.1:32100',
        socketPath: '/socket.io',
      },
    });
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
        serverVersion: '0.0.0',
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
