import { describe, expect, it, vi } from 'vitest';

import { PROTOCOL_VERSION } from '@texas-holdem/protocol';

import {
  CommandTransportError,
  SocketIoConnectionAdapter,
  type ClientSocketPort,
} from './socket-io-adapter.js';

class FakeSocket implements ClientSocketPort {
  connected = false;
  readonly listeners = new Map<
    string,
    Array<(...arguments_: never[]) => void>
  >();
  acknowledge: (
    payload: unknown,
    callback: (error: Error | null, response?: unknown) => void,
  ) => void = (payload, callback) => {
    const commandId =
      typeof payload === 'object' && payload && 'commandId' in payload
        ? payload.commandId
        : 'unknown';
    callback(null, {
      protocolVersion: PROTOCOL_VERSION,
      commandId,
      status: 'accepted',
      stateVersion: 1,
      sequence: 1,
    });
  };
  lastPayload: unknown;

  connect(): void {
    this.connected = true;
    this.emitLocal('connect');
  }
  disconnect(): void {
    this.connected = false;
  }
  on(event: string, listener: (...arguments_: never[]) => void): void {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
  }
  off(event: string, listener: (...arguments_: never[]) => void): void {
    this.listeners.set(
      event,
      (this.listeners.get(event) ?? []).filter(
        (candidate) => candidate !== listener,
      ),
    );
  }
  timeout(): ReturnType<ClientSocketPort['timeout']> {
    return {
      emit: (_event, payload, callback) => {
        this.lastPayload = payload;
        this.acknowledge(payload, callback);
      },
    };
  }
  emitLocal(event: string, ...arguments_: unknown[]): void {
    for (const listener of this.listeners.get(event) ?? []) {
      listener(...(arguments_ as never[]));
    }
  }
}

class DelayedSocket extends FakeSocket {
  override connect(): void {
    // The test controls when this socket reports a connection.
  }
}

const credentials = {
  protocolVersion: PROTOCOL_VERSION,
  roomId: 'room-1',
  playerId: 'host',
  token: 'host-secret-token',
};

describe('SocketIoConnectionAdapter', () => {
  it('generates one stable command id and maps an accepted acknowledgement', async () => {
    const socket = new FakeSocket();
    const ids = vi.fn(() => 'generated-command-id');
    const adapter = new SocketIoConnectionAdapter(
      'http://10.126.126.1:32100',
      '/socket.io',
      () => socket,
      ids,
    );
    await adapter.connect(credentials);
    const lost = vi.fn();
    adapter.onConnectionLost(lost);
    socket.emitLocal('disconnect', 'transport close');
    expect(lost).toHaveBeenCalledWith('transport close');
    const response = await adapter.sendCommand({
      protocolVersion: PROTOCOL_VERSION,
      roomId: 'room-1',
      playerId: 'host',
      expectedVersion: 0,
      type: 'room.pause',
    });

    expect(ids).toHaveBeenCalledTimes(1);
    expect(socket.lastPayload).toMatchObject({
      commandId: 'generated-command-id',
    });
    expect(response).toMatchObject({
      status: 'accepted',
      commandId: 'generated-command-id',
    });
  });

  it.each(['conflict', 'unauthorized'] as const)(
    'preserves an explicit %s server result',
    async (status) => {
      const socket = new FakeSocket();
      socket.acknowledge = (payload, callback) => {
        const commandId = (payload as { commandId: string }).commandId;
        callback(
          null,
          status === 'conflict'
            ? {
                protocolVersion: PROTOCOL_VERSION,
                commandId,
                status,
                expectedVersion: 1,
                currentVersion: 2,
                error: { code: 'CONFLICT', message: 'changed' },
              }
            : {
                protocolVersion: PROTOCOL_VERSION,
                commandId,
                status,
                error: { code: 'UNAUTHORIZED', message: 'identity' },
              },
        );
      };
      const adapter = new SocketIoConnectionAdapter(
        'http://host',
        '/socket.io',
        () => socket,
      );
      await adapter.connect(credentials);
      await expect(
        adapter.sendCommand({ commandId: 'command-1' }),
      ).resolves.toMatchObject({
        status,
      });
    },
  );

  it('returns a stable timeout transport error', async () => {
    const socket = new FakeSocket();
    socket.acknowledge = (_payload, callback) => callback(new Error('timeout'));
    const adapter = new SocketIoConnectionAdapter(
      'http://host',
      '/socket.io',
      () => socket,
    );
    await adapter.connect(credentials);
    await expect(
      adapter.sendCommand({ commandId: 'command-1' }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<CommandTransportError>>({
        code: 'TIMEOUT',
        name: 'CommandTransportError',
      }),
    );
  });

  it('isolates stale socket completion from the next generation', async () => {
    const sockets: DelayedSocket[] = [];
    const adapter = new SocketIoConnectionAdapter(
      'http://host',
      '/socket.io',
      () => {
        const socket = new DelayedSocket();
        sockets.push(socket);
        return socket;
      },
    );
    const first = adapter.connect(credentials);
    const second = adapter.connect(credentials);
    const firstSocket = sockets[0];
    const secondSocket = sockets[1];
    if (!firstSocket || !secondSocket) throw new Error('Sockets not created');

    await expect(first).rejects.toMatchObject({ code: 'DISCONNECTED' });
    secondSocket.connected = true;
    secondSocket.emitLocal('connect');
    await expect(second).resolves.toBeUndefined();

    firstSocket.emitLocal('connect_error', new Error('stale failure'));
    firstSocket.emitLocal('disconnect', 'stale close');
    expect(
      adapter.sendCommand({ commandId: 'command-1' }),
    ).resolves.toMatchObject({ status: 'accepted' });
  });
});
