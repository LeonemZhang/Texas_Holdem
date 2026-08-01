import { createSocket, type Socket } from 'node:dgram';

import { PROTOCOL_VERSION } from '@texas-holdem/protocol';

import {
  DISCOVERY_MAGIC,
  DiscoveryRequestSchema,
  RoomDiscoveryResponseSchema,
  type RoomDiscoveryResponse,
} from './messages.js';

export interface PublicRoomSummary {
  readonly roomId: string;
  readonly roomName: string;
  readonly hostNickname: string;
  readonly playerCount: number;
  readonly maxPlayers: number;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly phase: RoomDiscoveryResponse['phase'];
}

export interface UdpDiscoveryResponderOptions {
  readonly bindAddress?: string;
  readonly discoveryPort: number;
  readonly advertisedAddress: string;
  readonly httpPort: number;
  readonly roomSummary: () => PublicRoomSummary | null;
}

export interface BoundUdpAddress {
  readonly address: string;
  readonly port: number;
}

export class UdpDiscoveryResponder {
  #socket: Socket | null = null;

  constructor(private readonly options: UdpDiscoveryResponderOptions) {
    if (
      !Number.isSafeInteger(options.discoveryPort) ||
      options.discoveryPort < 0 ||
      options.discoveryPort > 65_535
    ) {
      throw new RangeError('Discovery port must be between 0 and 65535');
    }
    if (
      !Number.isSafeInteger(options.httpPort) ||
      options.httpPort <= 0 ||
      options.httpPort > 65_535
    ) {
      throw new RangeError('HTTP port must be between 1 and 65535');
    }
  }

  async start(): Promise<BoundUdpAddress> {
    if (this.#socket) throw new Error('Discovery responder is already started');
    const socket = createSocket('udp4');
    this.#socket = socket;
    socket.on('message', (message, remote) => {
      let raw: unknown;
      try {
        raw = JSON.parse(message.toString('utf8'));
      } catch {
        return;
      }
      const request = DiscoveryRequestSchema.safeParse(raw);
      const summary = this.options.roomSummary();
      if (!request.success || !summary) return;
      const response = RoomDiscoveryResponseSchema.parse({
        magic: DISCOVERY_MAGIC,
        protocolVersion: PROTOCOL_VERSION,
        requestId: request.data.requestId,
        type: 'room',
        ...summary,
        hostAddress: this.options.advertisedAddress,
        httpPort: this.options.httpPort,
      });
      socket.send(JSON.stringify(response), remote.port, remote.address);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('error', reject);
        socket.bind(
          this.options.discoveryPort,
          this.options.bindAddress ?? '0.0.0.0',
          () => {
            socket.off('error', reject);
            resolve();
          },
        );
      });
    } catch (error) {
      socket.close();
      this.#socket = null;
      throw error;
    }
    const address = socket.address();
    if (typeof address === 'string') {
      await this.close();
      throw new Error('UDP responder did not bind an IPv4 address');
    }
    return Object.freeze({ address: address.address, port: address.port });
  }

  async close(): Promise<void> {
    const socket = this.#socket;
    if (!socket) return;
    this.#socket = null;
    await new Promise<void>((resolve) => socket.close(() => resolve()));
  }
}
