import { describe, expect, it, vi } from 'vitest';

import {
  PROTOCOL_VERSION,
  type CommandResponse,
  type DomainEvent,
  type PlayerSnapshot,
  type ResyncRequest,
  type ResyncResponse,
  type SocketAuthentication,
} from '@texas-holdem/protocol';

import type { ConnectionAdapter } from './connection.js';
import {
  RECONNECT_INTERVAL_MS,
  RECONNECT_MAX_ATTEMPTS,
  ReconnectController,
} from './reconnect-controller.js';

const credentials: SocketAuthentication = {
  protocolVersion: PROTOCOL_VERSION,
  roomId: 'room-1',
  playerId: 'player-1',
  token: 'player-token-123456',
};

class FakeConnection implements ConnectionAdapter {
  readonly connect = vi.fn<
    (credentials: SocketAuthentication) => Promise<void>
  >(async (_credentials) => undefined);
  readonly disconnect = vi.fn();
  readonly sendCommand = vi.fn(
    async (_command: unknown, _timeoutMs?: number): Promise<CommandResponse> =>
      ({
        protocolVersion: PROTOCOL_VERSION,
        commandId: 'command-1',
        status: 'accepted',
        stateVersion: 1,
        sequence: 1,
      }) as CommandResponse,
  );
  readonly requestResync = vi.fn(
    async (_request: ResyncRequest): Promise<ResyncResponse> =>
      ({
        protocolVersion: PROTOCOL_VERSION,
        status: 'snapshot',
        snapshot: {} as PlayerSnapshot,
      }) as ResyncResponse,
  );
  #connectionLost: ((reason: string) => void) | null = null;

  onConnectionLost(listener: (reason: string) => void): () => void {
    this.#connectionLost = listener;
    return () => {
      if (this.#connectionLost === listener) this.#connectionLost = null;
    };
  }

  onDomainEvent(_listener: (event: DomainEvent) => void): () => void {
    return () => undefined;
  }

  onSnapshot(_listener: (snapshot: PlayerSnapshot) => void): () => void {
    return () => undefined;
  }

  emitConnectionLost(reason: string): void {
    this.#connectionLost?.(reason);
  }
}

describe('ReconnectController', () => {
  it('uses a fixed interval, stops at twenty attempts, then requires manual retry', async () => {
    vi.useFakeTimers();
    try {
      const connection = new FakeConnection();
      connection.connect.mockRejectedValue(new Error('host unavailable'));
      const controller = new ReconnectController(connection, credentials);

      controller.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(connection.connect).toHaveBeenCalledTimes(1);

      for (let attempt = 2; attempt <= RECONNECT_MAX_ATTEMPTS; attempt += 1) {
        await vi.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS);
        expect(connection.connect).toHaveBeenCalledTimes(attempt);
      }
      expect(controller.state).toEqual({
        status: 'failed',
        error: expect.stringContaining('20'),
      });

      await vi.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS * 2);
      expect(connection.connect).toHaveBeenCalledTimes(RECONNECT_MAX_ATTEMPTS);

      controller.retry();
      await vi.advanceTimersByTimeAsync(0);
      expect(connection.connect).toHaveBeenCalledTimes(
        RECONNECT_MAX_ATTEMPTS + 1,
      );
      expect(controller.mode).toBe('manual');

      connection.emitConnectionLost('manual cycle transport close');
      expect(controller.mode).toBe('manual');
      await vi.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS);
      expect(connection.connect).toHaveBeenCalledTimes(
        RECONNECT_MAX_ATTEMPTS + 2,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a connected socket in recovery until the accepted snapshot arrives', async () => {
    vi.useFakeTimers();
    try {
      const connection = new FakeConnection();
      const controller = new ReconnectController(connection, credentials, {
        snapshotTimeoutMs: 10_000,
      });

      controller.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(controller.state).toEqual({ status: 'connected' });

      await vi.advanceTimersByTimeAsync(9_999);
      expect(controller.state).toEqual({ status: 'connected' });
      controller.acceptSnapshot();
      await vi.advanceTimersByTimeAsync(1);
      expect(controller.state).toEqual({ status: 'connected' });

      connection.emitConnectionLost('transport close');
      expect(controller.state).toEqual({
        status: 'recovering',
        reason: 'transport close',
      });
      await vi.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS);
      expect(connection.connect).toHaveBeenCalledTimes(2);
      controller.acceptSnapshot();
      expect(controller.state).toEqual({ status: 'connected' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels pending attempts and stale connection completion on stop and retry', async () => {
    vi.useFakeTimers();
    try {
      const connection = new FakeConnection();
      let resolveFirst: (() => void) | undefined;
      connection.connect.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirst = resolve;
          }),
      );
      const controller = new ReconnectController(connection, credentials);

      controller.start();
      await vi.advanceTimersByTimeAsync(0);
      controller.retry();
      await vi.advanceTimersByTimeAsync(0);
      expect(connection.connect).toHaveBeenCalledTimes(2);
      expect(controller.state).toEqual({ status: 'connected' });

      resolveFirst?.();
      await vi.advanceTimersByTimeAsync(0);
      expect(controller.state).toEqual({ status: 'connected' });

      controller.stop();
      expect(controller.state).toEqual({ status: 'disconnected' });
      await vi.advanceTimersByTimeAsync(RECONNECT_INTERVAL_MS * 2);
      expect(connection.connect).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
