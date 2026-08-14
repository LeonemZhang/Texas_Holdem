import type {
  CommandResponse,
  DomainEvent,
  HostManagementSnapshot,
  PlayerSnapshot,
  ResyncRequest,
  ResyncResponse,
  ResyncHostResponse,
  SocketAuthentication,
} from '@texas-holdem/protocol';

export type ConnectionState =
  | { readonly status: 'disconnected' }
  | { readonly status: 'connecting' }
  | { readonly status: 'connected' }
  | { readonly status: 'recovering'; readonly reason: string }
  | { readonly status: 'failed'; readonly error: string };

export type ConnectionEvent =
  | { readonly type: 'connect-requested' }
  | { readonly type: 'connected' }
  | { readonly type: 'connection-lost'; readonly reason: string }
  | { readonly type: 'recovery-succeeded' }
  | { readonly type: 'failed'; readonly error: string }
  | { readonly type: 'disconnected' };

export type ConnectionListener = (state: ConnectionState) => void;

export interface ConnectionAdapter {
  connect(credentials: SocketAuthentication): Promise<void>;
  disconnect(): void;
  sendCommand(command: unknown, timeoutMs?: number): Promise<CommandResponse>;
  requestResync(request: ResyncRequest): Promise<ResyncResponse>;
  onConnectionLost(listener: (reason: string) => void): () => void;
  onDomainEvent(listener: (event: DomainEvent) => void): () => void;
  onSnapshot(listener: (snapshot: PlayerSnapshot) => void): () => void;
  onHostSnapshot?: (
    listener: (snapshot: HostManagementSnapshot) => void,
  ) => () => void;
  requestHostResync?: (request: ResyncRequest) => Promise<ResyncHostResponse>;
}

export function reduceConnectionState(
  _state: ConnectionState,
  event: ConnectionEvent,
): ConnectionState {
  switch (event.type) {
    case 'connect-requested':
      return Object.freeze({ status: 'connecting' });
    case 'connected':
    case 'recovery-succeeded':
      return Object.freeze({ status: 'connected' });
    case 'connection-lost':
      return Object.freeze({ status: 'recovering', reason: event.reason });
    case 'failed':
      return Object.freeze({ status: 'failed', error: event.error });
    case 'disconnected':
      return Object.freeze({ status: 'disconnected' });
  }
}

export class ConnectionStateMachine {
  #state: ConnectionState = Object.freeze({ status: 'disconnected' });
  readonly #listeners = new Set<ConnectionListener>();

  get state(): ConnectionState {
    return this.#state;
  }

  dispatch(event: ConnectionEvent): ConnectionState {
    this.#state = reduceConnectionState(this.#state, event);
    this.#listeners.forEach((listener) => listener(this.#state));
    return this.#state;
  }

  subscribe(listener: ConnectionListener): () => void {
    this.#listeners.add(listener);
    listener(this.#state);
    return () => this.#listeners.delete(listener);
  }
}
