import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import type {
  PersistedReconnectIdentity,
  ReconnectIdentityStorePort,
} from '../application/reconnect-identity-store.js';
import type { ReconnectRegistry } from '../domain/reconnect.js';

interface IdentityRow {
  readonly player_id: string;
  readonly token_salt: Uint8Array;
  readonly token_hash: Uint8Array;
  readonly resume_status: PersistedReconnectIdentity['resumeStatus'];
}

export class SqliteReconnectIdentityStore implements ReconnectIdentityStorePort {
  constructor(
    private readonly database: DatabaseSync,
    private readonly saltFactory: () => Buffer = () => randomBytes(16),
  ) {}

  save(roomId: string, registry: ReconnectRegistry, updatedAtMs: number): void {
    const upsert = this.database.prepare(`
      INSERT INTO reconnect_identities (
        room_id, player_id, token_salt, token_hash, resume_status, updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (room_id, player_id) DO UPDATE SET
        token_salt = excluded.token_salt,
        token_hash = excluded.token_hash,
        resume_status = excluded.resume_status,
        updated_at_ms = excluded.updated_at_ms
    `);
    for (const identity of registry.identities) {
      if (identity.token.length < 16) {
        throw new RangeError(
          'Reconnect token must contain at least 16 characters',
        );
      }
      const salt = this.saltFactory();
      if (salt.byteLength < 16) {
        throw new RangeError(
          'Reconnect token salt must contain at least 16 bytes',
        );
      }
      upsert.run(
        roomId,
        identity.playerId,
        salt,
        scryptSync(identity.token, salt, 32),
        identity.resumeStatus,
        updatedAtMs,
      );
    }
  }

  authenticate(
    roomId: string,
    token: string,
  ): PersistedReconnectIdentity | null {
    if (token.length < 16) return null;
    const rows = this.database
      .prepare(
        `
        SELECT player_id, token_salt, token_hash, resume_status
        FROM reconnect_identities
        WHERE room_id = ?
      `,
      )
      .all(roomId) as unknown as IdentityRow[];
    for (const row of rows) {
      const expected = Buffer.from(row.token_hash);
      const candidate = scryptSync(
        token,
        Buffer.from(row.token_salt),
        expected.length,
      );
      if (timingSafeEqual(candidate, expected)) {
        return Object.freeze({
          playerId: row.player_id,
          resumeStatus: row.resume_status,
        });
      }
    }
    return null;
  }
}
