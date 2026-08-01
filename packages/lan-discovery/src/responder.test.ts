import { createSocket } from 'node:dgram';

import { afterEach, describe, expect, it } from 'vitest';

import { PROTOCOL_VERSION } from '@texas-holdem/protocol';

import { DISCOVERY_MAGIC, RoomDiscoveryResponseSchema } from './messages.js';
import { UdpDiscoveryResponder } from './responder.js';

const responders: UdpDiscoveryResponder[] = [];

afterEach(async () => {
  await Promise.all(responders.splice(0).map((responder) => responder.close()));
});

function receiveOnce(socket: ReturnType<typeof createSocket>) {
  return new Promise<Buffer>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Timed out waiting for UDP response')),
      1_000,
    );
    socket.once('message', (message) => {
      clearTimeout(timeout);
      resolve(message);
    });
  });
}

describe('UdpDiscoveryResponder', () => {
  it('unicasts a valid room summary with selected IP and actual TCP port', async () => {
    const responder = new UdpDiscoveryResponder({
      bindAddress: '127.0.0.1',
      discoveryPort: 0,
      advertisedAddress: '10.126.126.1',
      httpPort: 45_678,
      roomSummary: () => ({
        roomId: 'room-1',
        roomName: 'Friends',
        hostNickname: 'Alice',
        playerCount: 2,
        maxPlayers: 10,
        smallBlind: 1,
        bigBlind: 2,
        phase: 'lobby',
      }),
    });
    responders.push(responder);
    const bound = await responder.start();
    const client = createSocket('udp4');
    try {
      const response = receiveOnce(client);
      client.send(
        JSON.stringify({
          magic: DISCOVERY_MAGIC,
          protocolVersion: PROTOCOL_VERSION,
          requestId: 'scan-1',
          type: 'discover',
        }),
        bound.port,
        '127.0.0.1',
      );
      expect(
        RoomDiscoveryResponseSchema.parse(
          JSON.parse((await response).toString('utf8')),
        ),
      ).toMatchObject({
        requestId: 'scan-1',
        hostAddress: '10.126.126.1',
        httpPort: 45_678,
      });
    } finally {
      client.close();
    }
  });

  it('does not reply to malformed discovery traffic', async () => {
    const responder = new UdpDiscoveryResponder({
      bindAddress: '127.0.0.1',
      discoveryPort: 0,
      advertisedAddress: '10.126.126.1',
      httpPort: 32_100,
      roomSummary: () => ({
        roomId: 'room-1',
        roomName: 'Friends',
        hostNickname: 'Alice',
        playerCount: 2,
        maxPlayers: 10,
        smallBlind: 1,
        bigBlind: 2,
        phase: 'lobby',
      }),
    });
    responders.push(responder);
    const bound = await responder.start();
    const client = createSocket('udp4');
    let replied = false;
    client.on('message', () => {
      replied = true;
    });
    try {
      client.send('{"magic":"wrong"}', bound.port, '127.0.0.1');
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(replied).toBe(false);
    } finally {
      client.close();
    }
  });
});
