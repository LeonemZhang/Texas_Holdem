import { io, type Socket } from 'socket.io-client';

import {
  CommandResponseSchema,
  DomainEventSchema,
  PlayerSnapshotSchema,
  ResyncResponseSchema,
  type CommandResponse,
  type DomainEvent,
  type PlayerSnapshot,
  type ResyncRequest,
  type ResyncResponse,
  type SocketAuthentication,
} from '@texas-holdem/protocol';

import type { ConnectionAdapter } from './connection.js';

type Acknowledge = (error: Error | null, response?: unknown) => void;

export interface ClientSocketPort {
  readonly connected: boolean;
  connect(): void;
  disconnect(): void;
  on(event: 'connect', listener: () => void): void;
  on(event: 'connect_error', listener: (error: Error) => void): void;
  on(event: 'disconnect', listener: (reason: string) => void): void;
  on(event: 'event:domain', listener: (payload: unknown) => void): void;
  on(event: 'state:snapshot', listener: (payload: unknown) => void): void;
  off(event: string, listener: (...arguments_: never[]) => void): void;
  timeout(milliseconds: number): {
    emit(event: string, payload: unknown, acknowledge: Acknowledge): void;
  };
}

export type ClientSocketFactory = (
  url: string,
  credentials: SocketAuthentication,
  socketPath: string,
) => ClientSocketPort;

export class CommandTransportError extends Error {
  constructor(
    readonly code:
      'CONNECTION_FAILED' | 'DISCONNECTED' | 'TIMEOUT' | 'INVALID_RESPONSE',
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'CommandTransportError';
  }
}

const defaultSocketFactory: ClientSocketFactory = (
  url,
  credentials,
  socketPath,
) =>
  io(url, {
    autoConnect: false,
    auth: credentials,
    path: socketPath,
  }) as Socket as unknown as ClientSocketPort;

export class SocketIoConnectionAdapter implements ConnectionAdapter {
  readonly #lostListeners = new Set<(reason: string) => void>();
  readonly #eventListeners = new Set<(event: DomainEvent) => void>();
  readonly #snapshotListeners = new Set<(snapshot: PlayerSnapshot) => void>();
  #socket: ClientSocketPort | null = null;

  constructor(
    private readonly url: string,
    private readonly socketPath = '/socket.io',
    private readonly socketFactory: ClientSocketFactory = defaultSocketFactory,
    private readonly commandIdFactory: () => string = () => crypto.randomUUID(),
  ) {}

  async connect(credentials: SocketAuthentication): Promise<void> {
    this.disconnect();
    const socket = this.socketFactory(this.url, credentials, this.socketPath);
    this.#socket = socket;
    await new Promise<void>((resolve, reject) => {
      const connected = () => {
        socket.off('connect_error', failed as (...arguments_: never[]) => void);
        resolve();
      };
      const failed = (error: Error) => {
        socket.off('connect', connected);
        reject(
          new CommandTransportError('CONNECTION_FAILED', error.message, {
            cause: error,
          }),
        );
      };
      socket.on('connect', connected);
      socket.on('connect_error', failed);
      socket.on('disconnect', (reason) => {
        this.#lostListeners.forEach((listener) => listener(reason));
      });
      socket.on('event:domain', (payload) => {
        const event = DomainEventSchema.safeParse(payload);
        if (event.success) {
          this.#eventListeners.forEach((listener) => listener(event.data));
        }
      });
      socket.on('state:snapshot', (payload) => {
        const snapshot = PlayerSnapshotSchema.safeParse(payload);
        if (snapshot.success) {
          this.#snapshotListeners.forEach((listener) =>
            listener(snapshot.data),
          );
        }
      });
      socket.connect();
    });
  }

  disconnect(): void {
    this.#socket?.disconnect();
    this.#socket = null;
  }

  createCommandId(): string {
    return this.commandIdFactory();
  }

  sendCommand(command: unknown, timeoutMs = 5_000): Promise<CommandResponse> {
    const commandWithId = this.ensureCommandId(command);
    return this.emitWithAck(
      'command:submit',
      commandWithId,
      timeoutMs,
      (response) => CommandResponseSchema.safeParse(response),
    );
  }

  requestResync(
    request: ResyncRequest,
    timeoutMs = 5_000,
  ): Promise<ResyncResponse> {
    return this.emitWithAck('state:resync', request, timeoutMs, (response) =>
      ResyncResponseSchema.safeParse(response),
    );
  }

  onConnectionLost(listener: (reason: string) => void): () => void {
    this.#lostListeners.add(listener);
    return () => this.#lostListeners.delete(listener);
  }

  onDomainEvent(listener: (event: DomainEvent) => void): () => void {
    this.#eventListeners.add(listener);
    return () => this.#eventListeners.delete(listener);
  }

  onSnapshot(listener: (snapshot: PlayerSnapshot) => void): () => void {
    this.#snapshotListeners.add(listener);
    return () => this.#snapshotListeners.delete(listener);
  }

  private ensureCommandId(command: unknown): unknown {
    if (
      typeof command !== 'object' ||
      command === null ||
      Array.isArray(command)
    ) {
      return command;
    }
    if (
      'commandId' in command &&
      typeof command.commandId === 'string' &&
      command.commandId.trim()
    ) {
      return command;
    }
    return { ...command, commandId: this.createCommandId() };
  }

  private emitWithAck<Result>(
    event: string,
    payload: unknown,
    timeoutMs: number,
    parse: (
      response: unknown,
    ) =>
      | { readonly success: true; readonly data: Result }
      | { readonly success: false },
  ): Promise<Result> {
    const socket = this.#socket;
    if (!socket?.connected) {
      return Promise.reject(
        new CommandTransportError('DISCONNECTED', 'Socket is not connected'),
      );
    }
    return new Promise<Result>((resolve, reject) => {
      socket.timeout(timeoutMs).emit(event, payload, (error, response) => {
        if (error) {
          reject(
            new CommandTransportError(
              'TIMEOUT',
              'Command acknowledgement timed out',
              {
                cause: error,
              },
            ),
          );
          return;
        }
        const parsed = parse(response);
        if (!parsed.success) {
          reject(
            new CommandTransportError(
              'INVALID_RESPONSE',
              'Server acknowledgement is invalid',
            ),
          );
          return;
        }
        resolve(parsed.data);
      });
    });
  }
}
