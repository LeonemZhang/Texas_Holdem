import { PROTOCOL_VERSION } from '@texas-holdem/protocol';
import { io as createSocketClient } from 'socket.io-client';
import { afterEach, describe, expect, it } from 'vitest';
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
    });
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
});
