import { createSocket, type Socket } from 'node:dgram';
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';

import { PROTOCOL_VERSION } from '@texas-holdem/protocol';

import {
  DISCOVERY_MAGIC,
  DiscoveryRequestSchema,
  RoomDiscoveryResponseSchema,
  type RoomDiscoveryResponse,
} from './messages.js';

export interface DiscoveredRoom extends RoomDiscoveryResponse {
  readonly lastSeenAtMs: number;
}

export class LanDiscoveryUnavailableError extends Error {
  readonly code = 'LAN_DISCOVERY_UNAVAILABLE';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'LanDiscoveryUnavailableError';
  }
}

function ipv4ToNumber(address: string): number {
  const parts = address.split('.').map(Number);
  if (
    parts.length !== 4 ||
    parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  ) {
    throw new RangeError(`Invalid IPv4 address: ${address}`);
  }
  return parts.reduce((value, part) => (value * 256 + part) >>> 0, 0);
}

function numberToIpv4(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.');
}

export function ipv4BroadcastAddress(address: string, netmask: string): string {
  const ip = ipv4ToNumber(address);
  const mask = ipv4ToNumber(netmask);
  return numberToIpv4((ip | ~mask) >>> 0);
}

export function listIpv4BroadcastTargets(
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]>,
): readonly string[] {
  const targets = new Set<string>();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        targets.add(ipv4BroadcastAddress(entry.address, entry.netmask));
      }
    }
  }
  return Object.freeze([...targets].sort());
}

export class DiscoveryResultSet {
  readonly #rooms = new Map<string, DiscoveredRoom>();

  constructor(private readonly staleAfterMs: number) {
    if (!Number.isSafeInteger(staleAfterMs) || staleAfterMs <= 0) {
      throw new RangeError('Discovery stale timeout must be positive');
    }
  }

  accept(raw: unknown, requestId: string, receivedAtMs: number): boolean {
    const response = RoomDiscoveryResponseSchema.safeParse(raw);
    if (!response.success || response.data.requestId !== requestId)
      return false;
    this.#rooms.set(
      response.data.roomId,
      Object.freeze({ ...response.data, lastSeenAtMs: receivedAtMs }),
    );
    return true;
  }

  list(nowMs: number): readonly DiscoveredRoom[] {
    for (const [roomId, room] of this.#rooms) {
      if (nowMs - room.lastSeenAtMs > this.staleAfterMs) {
        this.#rooms.delete(roomId);
      }
    }
    return Object.freeze(
      [...this.#rooms.values()].sort((left, right) =>
        left.roomName.localeCompare(right.roomName),
      ),
    );
  }
}

export interface LanRoomScannerOptions {
  readonly discoveryPort: number;
  readonly scanWindowMs?: number;
  readonly staleAfterMs?: number;
  readonly interfaces?: () => NodeJS.Dict<NetworkInterfaceInfo[]>;
  readonly nowMs?: () => number;
}

export class LanRoomScanner {
  readonly #results: DiscoveryResultSet;
  readonly #interfaces: () => NodeJS.Dict<NetworkInterfaceInfo[]>;
  readonly #nowMs: () => number;
  #socket: Socket | null = null;
  #requestId: string | null = null;
  #scanning = false;

  constructor(private readonly options: LanRoomScannerOptions) {
    if (
      !Number.isSafeInteger(options.discoveryPort) ||
      options.discoveryPort <= 0 ||
      options.discoveryPort > 65_535
    ) {
      throw new RangeError('Discovery port must be between 1 and 65535');
    }
    this.#interfaces = options.interfaces ?? networkInterfaces;
    this.#nowMs = options.nowMs ?? Date.now;
    this.#results = new DiscoveryResultSet(options.staleAfterMs ?? 5_000);
  }

  async scan(requestId: string): Promise<readonly DiscoveredRoom[]> {
    if (this.#scanning)
      throw new Error('A LAN discovery scan is already active');
    const request = DiscoveryRequestSchema.parse({
      magic: DISCOVERY_MAGIC,
      protocolVersion: PROTOCOL_VERSION,
      requestId,
      type: 'discover',
    });
    const targets = listIpv4BroadcastTargets(this.#interfaces());
    if (targets.length === 0) {
      throw new LanDiscoveryUnavailableError(
        'No non-internal IPv4 interface supports LAN broadcast',
      );
    }
    const socket = await this.ensureSocket();
    this.#scanning = true;
    this.#requestId = requestId;
    try {
      const message = Buffer.from(JSON.stringify(request));
      const sends = await Promise.allSettled(
        targets.map(
          (target) =>
            new Promise<void>((resolve, reject) => {
              socket.send(
                message,
                this.options.discoveryPort,
                target,
                (error) => (error ? reject(error) : resolve()),
              );
            }),
        ),
      );
      if (sends.every(({ status }) => status === 'rejected')) {
        throw new LanDiscoveryUnavailableError(
          'Every IPv4 broadcast send failed',
          { cause: sends },
        );
      }
      await new Promise((resolve) =>
        setTimeout(resolve, this.options.scanWindowMs ?? 500),
      );
      return this.#results.list(this.#nowMs());
    } finally {
      this.#requestId = null;
      this.#scanning = false;
    }
  }

  list(): readonly DiscoveredRoom[] {
    return this.#results.list(this.#nowMs());
  }

  async close(): Promise<void> {
    const socket = this.#socket;
    if (!socket) return;
    this.#socket = null;
    await new Promise<void>((resolve) => socket.close(() => resolve()));
  }

  private async ensureSocket(): Promise<Socket> {
    if (this.#socket) return this.#socket;
    const socket = createSocket('udp4');
    this.#socket = socket;
    socket.on('message', (message) => {
      if (!this.#requestId) return;
      try {
        this.#results.accept(
          JSON.parse(message.toString('utf8')),
          this.#requestId,
          this.#nowMs(),
        );
      } catch {
        // Malformed UDP traffic is ignored at the network boundary.
      }
    });
    try {
      await new Promise<void>((resolve, reject) => {
        socket.once('error', reject);
        socket.bind(0, '0.0.0.0', () => {
          socket.off('error', reject);
          socket.setBroadcast(true);
          resolve();
        });
      });
      return socket;
    } catch (error) {
      socket.close();
      this.#socket = null;
      throw new LanDiscoveryUnavailableError('Unable to open UDP scanner', {
        cause: error,
      });
    }
  }
}
