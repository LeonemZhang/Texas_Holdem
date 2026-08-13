import type { SocketAuthentication } from '@texas-holdem/protocol';

import {
  ConnectionStateMachine,
  type ConnectionAdapter,
  type ConnectionListener,
  type ConnectionState,
} from './connection.js';

export const RECONNECT_INTERVAL_MS = 500;
export const RECONNECT_MAX_ATTEMPTS = 20;
export const RECONNECT_SNAPSHOT_TIMEOUT_MS = 10_000;

export type ReconnectMode = 'automatic' | 'manual';

export interface ReconnectControllerOptions {
  readonly snapshotTimeoutMs?: number;
}

interface AttemptIdentity {
  readonly cycle: number;
  readonly generation: number;
  readonly attempt: number;
}

export class ReconnectController {
  readonly #stateMachine = new ConnectionStateMachine();
  readonly #removeConnectionLost: () => void;
  readonly #connection: ConnectionAdapter;
  readonly #credentials: SocketAuthentication;
  readonly #snapshotTimeoutMs: number;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #snapshotTimer: ReturnType<typeof setTimeout> | null = null;
  #cycle = 0;
  #generation = 0;
  #attempt = 0;
  #activeAttempt: AttemptIdentity | null = null;
  #mode: ReconnectMode = 'automatic';
  #snapshotReady = false;
  #started = false;
  #stopped = false;

  constructor(
    connection: ConnectionAdapter,
    credentials: SocketAuthentication,
    options: ReconnectControllerOptions = {},
  ) {
    this.#connection = connection;
    this.#credentials = credentials;
    this.#snapshotTimeoutMs =
      options.snapshotTimeoutMs ?? RECONNECT_SNAPSHOT_TIMEOUT_MS;
    this.#removeConnectionLost = connection.onConnectionLost((reason) =>
      this.#handleConnectionLost(reason),
    );
  }

  get state(): ConnectionState {
    return this.#stateMachine.state;
  }

  get mode(): ReconnectMode {
    return this.#mode;
  }

  subscribe(listener: ConnectionListener): () => void {
    return this.#stateMachine.subscribe(listener);
  }

  start(): void {
    if (this.#started || this.#stopped) return;
    this.#started = true;
    this.#beginCycle('automatic', true);
  }

  retry(): void {
    if (this.#stopped) return;
    this.#started = true;
    this.#cancelCycle();
    this.#connection.disconnect();
    this.#beginCycle('manual', true);
  }

  acceptSnapshot(): void {
    if (!this.#started || this.#stopped) return;
    this.#snapshotReady = true;
    this.#clearSnapshotTimer();
    if (this.state.status !== 'connected') {
      this.#stateMachine.dispatch({ type: 'recovery-succeeded' });
    }
  }

  stop(): void {
    if (this.#stopped) return;
    this.#stopped = true;
    this.#started = false;
    this.#cancelCycle();
    this.#connection.disconnect();
    this.#removeConnectionLost();
    this.#stateMachine.dispatch({ type: 'disconnected' });
  }

  #beginCycle(mode: ReconnectMode, immediate: boolean): void {
    this.#mode = mode;
    this.#cycle += 1;
    this.#generation += 1;
    this.#attempt = 0;
    this.#activeAttempt = null;
    this.#snapshotReady = false;
    this.#clearSnapshotTimer();
    if (immediate) {
      this.#attemptConnection(this.#cycle, this.#generation);
    } else {
      this.#scheduleAttempt(this.#cycle, this.#generation);
    }
  }

  #attemptConnection(cycle: number, generation: number): void {
    if (!this.#isCurrentCycle(cycle, generation)) return;
    const identity: AttemptIdentity = {
      cycle,
      generation,
      attempt: ++this.#attempt,
    };
    this.#activeAttempt = identity;
    this.#stateMachine.dispatch({ type: 'connect-requested' });
    void Promise.resolve()
      .then(() => this.#connection.connect(this.#credentials))
      .then(
        () => this.#handleConnected(identity),
        (reason: unknown) => this.#handleConnectionFailure(identity, reason),
      );
  }

  #handleConnected(identity: AttemptIdentity): void {
    if (!this.#isCurrentAttempt(identity)) return;
    this.#stateMachine.dispatch({ type: 'connected' });
    if (this.#snapshotReady) return;
    this.#clearSnapshotTimer();
    this.#snapshotTimer = setTimeout(() => {
      if (!this.#isCurrentAttempt(identity) || this.#snapshotReady) return;
      this.#enterFailed('已连接房间，但未收到当前玩家的权威快照，请手动重试。');
    }, this.#snapshotTimeoutMs);
  }

  #handleConnectionFailure(identity: AttemptIdentity, reason: unknown): void {
    if (!this.#isCurrentAttempt(identity) || this.#stopped) return;
    const message = this.#errorMessage(reason);
    this.#activeAttempt = null;
    if (identity.attempt >= RECONNECT_MAX_ATTEMPTS) {
      this.#enterFailed(
        `自动恢复已尝试 ${RECONNECT_MAX_ATTEMPTS} 次，请手动重试。${message}`,
      );
      return;
    }
    this.#stateMachine.dispatch({ type: 'connection-lost', reason: message });
    this.#scheduleAttempt(identity.cycle, identity.generation);
  }

  #handleConnectionLost(reason: string): void {
    if (!this.#started || this.#stopped) return;
    this.#cancelTimer();
    this.#clearSnapshotTimer();
    this.#generation += 1;
    this.#cycle += 1;
    this.#attempt = 0;
    this.#activeAttempt = null;
    this.#snapshotReady = false;
    this.#stateMachine.dispatch({
      type: 'connection-lost',
      reason: reason || '连接已断开',
    });
    this.#scheduleAttempt(this.#cycle, this.#generation);
  }

  #scheduleAttempt(cycle: number, generation: number): void {
    this.#cancelTimer();
    this.#timer = setTimeout(() => {
      this.#timer = null;
      this.#attemptConnection(cycle, generation);
    }, RECONNECT_INTERVAL_MS);
  }

  #enterFailed(error: string): void {
    this.#cancelCycle();
    this.#connection.disconnect();
    this.#mode = 'manual';
    this.#stateMachine.dispatch({ type: 'failed', error });
  }

  #cancelCycle(): void {
    this.#cycle += 1;
    this.#generation += 1;
    this.#activeAttempt = null;
    this.#cancelTimer();
    this.#clearSnapshotTimer();
    this.#snapshotReady = false;
  }

  #cancelTimer(): void {
    if (this.#timer === null) return;
    clearTimeout(this.#timer);
    this.#timer = null;
  }

  #clearSnapshotTimer(): void {
    if (this.#snapshotTimer === null) return;
    clearTimeout(this.#snapshotTimer);
    this.#snapshotTimer = null;
  }

  #isCurrentCycle(cycle: number, generation: number): boolean {
    return (
      this.#started &&
      !this.#stopped &&
      this.#cycle === cycle &&
      this.#generation === generation
    );
  }

  #isCurrentAttempt(identity: AttemptIdentity): boolean {
    return (
      this.#isCurrentCycle(identity.cycle, identity.generation) &&
      this.#activeAttempt?.attempt === identity.attempt
    );
  }

  #errorMessage(reason: unknown): string {
    if (reason instanceof Error && reason.message.trim()) {
      return reason.message;
    }
    return '连接失败';
  }
}
