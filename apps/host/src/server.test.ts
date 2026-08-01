import { PROTOCOL_VERSION } from '@texas-holdem/protocol';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { io as createSocketClient } from 'socket.io-client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InMemorySessionAuthenticator } from './application/session-authenticator.js';
import { createHostServer, type HostServer } from './server.js';

let activeHost: HostServer | undefined;

afterEach(async () => {
  if (activeHost) {
    await activeHost.close();
    activeHost = undefined;
  }
});

describe('host framework server', () => {
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
});
