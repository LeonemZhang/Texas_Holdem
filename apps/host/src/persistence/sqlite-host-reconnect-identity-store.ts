import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export interface PersistedHostIdentity {
  readonly hostId: string;
}

interface HostIdentityRow {
  readonly host_id: string;
  readonly token_salt: Uint8Array;
  readonly token_hash: Uint8Array;
}

export class SqliteHostReconnectIdentityStore {
  constructor(
    private readonly database: DatabaseSync,
    private readonly saltFactory: () => Buffer = () => randomBytes(16),
  ) {}

  save(
    roomId: string,
    hostId: string,
    token: string,
    updatedAtMs: number,
  ): void {
    if (token.length < 16) {
      throw new RangeError(
        'Host reconnect token must contain at least 16 characters',
      );
    }
    const salt = this.saltFactory();
    if (salt.byteLength < 16) {
      throw new RangeError(
        'Host reconnect token salt must contain at least 16 bytes',
      );
    }
    this.database
      .prepare(
        `
        INSERT INTO host_reconnect_identities (
          room_id, host_id, token_salt, token_hash, updated_at_ms
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (room_id) DO UPDATE SET
          host_id = excluded.host_id,
          token_salt = excluded.token_salt,
          token_hash = excluded.token_hash,
          updated_at_ms = excluded.updated_at_ms
      `,
      )
      .run(roomId, hostId, salt, scryptSync(token, salt, 32), updatedAtMs);
  }

  authenticate(
    roomId: string,
    hostId: string,
    token: string,
  ): PersistedHostIdentity | null {
    if (token.length < 16) return null;
    const row = this.database
      .prepare(
        `
        SELECT host_id, token_salt, token_hash
        FROM host_reconnect_identities
        WHERE room_id = ? AND host_id = ?
      `,
      )
      .get(roomId, hostId) as unknown as HostIdentityRow | undefined;
    if (!row) return null;
    const expected = Buffer.from(row.token_hash);
    const candidate = scryptSync(
      token,
      Buffer.from(row.token_salt),
      expected.length,
    );
    return timingSafeEqual(candidate, expected)
      ? Object.freeze({ hostId: row.host_id })
      : null;
  }
}
