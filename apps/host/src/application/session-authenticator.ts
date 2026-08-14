import type { SocketAuthentication } from '@texas-holdem/protocol';

export interface SessionIdentity {
  readonly roomId: string;
  readonly playerId: string;
  readonly sessionType?: 'player' | 'host';
  readonly hostId?: string;
}

export interface SessionAuthenticator {
  authenticate(credentials: SocketAuthentication): SessionIdentity | null;
}

export class InMemorySessionAuthenticator implements SessionAuthenticator {
  readonly #tokens = new Map<string, SessionIdentity>();

  constructor(
    private readonly fallback?: (
      credentials: SocketAuthentication,
    ) => SessionIdentity | null,
  ) {}

  register(identity: SessionIdentity, token: string): void {
    const normalized = token.trim();
    if (normalized.length < 16) {
      throw new RangeError('Session token must contain at least 16 characters');
    }
    const existing = this.#tokens.get(normalized);
    if (
      existing &&
      (existing.roomId !== identity.roomId ||
        existing.playerId !== identity.playerId ||
        existing.sessionType !== identity.sessionType ||
        existing.hostId !== identity.hostId)
    ) {
      throw new RangeError('Session token is already bound to another player');
    }
    this.#tokens.set(normalized, Object.freeze({ ...identity }));
  }

  authenticate(credentials: SocketAuthentication): SessionIdentity | null {
    const identity = this.#tokens.get(credentials.token);
    if (!identity) return this.fallback?.(credentials) ?? null;
    if (
      identity.roomId !== credentials.roomId ||
      identity.playerId !== credentials.playerId ||
      (credentials.sessionType !== undefined &&
        credentials.sessionType !== (identity.sessionType ?? 'player')) ||
      (credentials.hostId !== undefined &&
        credentials.hostId !== identity.hostId)
    ) {
      return null;
    }
    return identity;
  }
}
