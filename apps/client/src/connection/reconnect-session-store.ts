import { PROTOCOL_VERSION } from '@texas-holdem/protocol';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface StoredReconnectSession {
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  readonly roomId: string;
  readonly playerId: string;
  readonly token: string;
  readonly joinUrl: string;
}

function isStoredSession(value: unknown): value is StoredReconnectSession {
  if (typeof value !== 'object' || value === null) return false;
  const session = value as Partial<StoredReconnectSession>;
  if (
    session.protocolVersion !== PROTOCOL_VERSION ||
    typeof session.roomId !== 'string' ||
    !session.roomId.trim() ||
    typeof session.playerId !== 'string' ||
    !session.playerId.trim() ||
    typeof session.token !== 'string' ||
    session.token.length < 16 ||
    typeof session.joinUrl !== 'string'
  ) {
    return false;
  }
  try {
    const url = new URL(session.joinUrl);
    return ['http:', 'https:'].includes(url.protocol);
  } catch {
    return false;
  }
}

export class ReconnectSessionStore {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly keyPrefix = 'texas-holdem:reconnect:',
  ) {}

  save(session: StoredReconnectSession): void {
    if (!isStoredSession(session)) {
      throw new RangeError('Reconnect session is invalid');
    }
    this.storage.setItem(this.key(session.roomId), JSON.stringify(session));
  }

  load(roomId: string): StoredReconnectSession | null {
    const key = this.key(roomId);
    const serialized = this.storage.getItem(key);
    if (!serialized) return null;
    try {
      const parsed: unknown = JSON.parse(serialized);
      if (!isStoredSession(parsed) || parsed.roomId !== roomId) {
        this.storage.removeItem(key);
        return null;
      }
      return Object.freeze({ ...parsed });
    } catch {
      this.storage.removeItem(key);
      return null;
    }
  }

  clear(roomId: string): void {
    this.storage.removeItem(this.key(roomId));
  }

  private key(roomId: string): string {
    const normalized = roomId.trim();
    if (!normalized) throw new RangeError('Room id cannot be empty');
    return `${this.keyPrefix}${encodeURIComponent(normalized)}`;
  }
}

export function browserReconnectSessionStore(): ReconnectSessionStore {
  return new ReconnectSessionStore(window.localStorage);
}
