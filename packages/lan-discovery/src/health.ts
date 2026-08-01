import {
  HealthResponseSchema,
  type HealthResponse,
} from '@texas-holdem/protocol';

import { DEFAULT_HTTP_PORT, type RoomDiscoveryResponse } from './messages.js';

export interface HealthFetchResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export type HealthFetcher = (
  url: string,
  init: { readonly signal: AbortSignal },
) => Promise<HealthFetchResponse>;

export type HealthValidationResult =
  | {
      readonly status: 'reachable';
      readonly joinUrl: string;
      readonly health: HealthResponse;
    }
  | {
      readonly status: 'unreachable' | 'incompatible';
      readonly joinUrl: string;
      readonly error: string;
    };

function isIpv4(value: string): boolean {
  const parts = value.split('.');
  return (
    parts.length === 4 &&
    parts.every((part) => {
      const number = Number(part);
      return /^\d{1,3}$/.test(part) && number >= 0 && number <= 255;
    })
  );
}

export function parseManualJoinAddress(
  input: string,
  defaultPort = DEFAULT_HTTP_PORT,
): URL {
  const normalized = input.trim();
  if (!normalized) throw new RangeError('Host address cannot be empty');
  if (
    !Number.isSafeInteger(defaultPort) ||
    defaultPort <= 0 ||
    defaultPort > 65_535
  ) {
    throw new RangeError('Default HTTP port must be between 1 and 65535');
  }
  const hasScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(normalized);
  let url: URL;
  try {
    url = new URL(hasScheme ? normalized : `http://${normalized}`);
  } catch (error) {
    throw new RangeError('Host address is not a valid IP or URL', {
      cause: error,
    });
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new RangeError('Only HTTP and HTTPS room URLs are supported');
  }
  if (url.username || url.password) {
    throw new RangeError('Room URLs cannot contain credentials');
  }
  if (!isIpv4(url.hostname)) {
    throw new RangeError('Room host must be an IPv4 address');
  }
  if (!url.port) url.port = String(defaultPort);
  return url;
}

export function roomJoinUrl(room: RoomDiscoveryResponse): URL {
  return parseManualJoinAddress(`${room.hostAddress}:${room.httpPort}`);
}

export async function validateRoomHealth(
  address: string | URL,
  options: {
    readonly timeoutMs?: number;
    readonly fetcher?: HealthFetcher;
  } = {},
): Promise<HealthValidationResult> {
  const joinUrl =
    address instanceof URL ? new URL(address) : parseManualJoinAddress(address);
  const timeoutMs = options.timeoutMs ?? 1_500;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    throw new RangeError('Health timeout must be a positive integer');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const fetcher: HealthFetcher =
    options.fetcher ??
    ((url, init) => fetch(url, init) as Promise<HealthFetchResponse>);
  try {
    const response = await fetcher(new URL('/health', joinUrl).toString(), {
      signal: controller.signal,
    });
    if (!response.ok) {
      return {
        status: 'unreachable',
        joinUrl: joinUrl.toString(),
        error: `Health endpoint returned HTTP ${response.status}`,
      };
    }
    const parsed = HealthResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      return {
        status: 'incompatible',
        joinUrl: joinUrl.toString(),
        error: 'Health response uses an incompatible protocol',
      };
    }
    return {
      status: 'reachable',
      joinUrl: joinUrl.toString(),
      health: parsed.data,
    };
  } catch (error) {
    return {
      status: 'unreachable',
      joinUrl: joinUrl.toString(),
      error: error instanceof Error ? error.message : 'Health request failed',
    };
  } finally {
    clearTimeout(timeout);
  }
}

export function validateDiscoveredRoom(
  room: RoomDiscoveryResponse,
  options: Parameters<typeof validateRoomHealth>[1] = {},
): Promise<HealthValidationResult> {
  return validateRoomHealth(roomJoinUrl(room), options);
}
