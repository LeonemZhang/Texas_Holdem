import { createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { gunzipSync, gzipSync } from 'node:zlib';

import type {
  RoomRecoveryState,
  SnapshotStorePort,
  StoredRoomSnapshot,
} from '../application/persistence-ports.js';

interface SnapshotRow {
  readonly room_id: string;
  readonly sequence: number;
  readonly state_version: number;
  readonly encoding: 'json' | 'gzip-json';
  readonly payload: Uint8Array;
  readonly checksum: string;
  readonly created_at_ms: number;
}

export class SnapshotRecoveryError extends Error {
  readonly code = 'SNAPSHOT_CORRUPTED';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'SnapshotRecoveryError';
  }
}

function checksum(payload: Uint8Array): string {
  return createHash('sha256').update(payload).digest('hex');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function freezeJson<Value>(value: Value): Value {
  if (Array.isArray(value)) {
    value.forEach((entry) => freezeJson(entry));
    return Object.freeze(value);
  }
  if (isRecord(value)) {
    Object.values(value).forEach((entry) => freezeJson(entry));
    return Object.freeze(value) as Value;
  }
  return value;
}

function parseRecoveryState(
  payload: Buffer,
  row: SnapshotRow,
): RoomRecoveryState {
  let parsed: unknown;
  try {
    parsed = JSON.parse(payload.toString('utf8'));
  } catch (error) {
    throw new SnapshotRecoveryError('Snapshot JSON is invalid', {
      cause: error,
    });
  }
  if (
    !isRecord(parsed) ||
    !isRecord(parsed.room) ||
    parsed.room.roomId !== row.room_id ||
    parsed.room.version !== row.state_version ||
    !('hand' in parsed) ||
    !('handReady' in parsed) ||
    !('chipRequests' in parsed)
  ) {
    throw new SnapshotRecoveryError(
      'Snapshot identity or state shape is invalid',
    );
  }
  return freezeJson(parsed) as unknown as RoomRecoveryState;
}

export class SqliteSnapshotStore implements SnapshotStorePort {
  constructor(
    private readonly database: DatabaseSync,
    private readonly compressionThresholdBytes = 64 * 1024,
  ) {
    if (
      !Number.isSafeInteger(compressionThresholdBytes) ||
      compressionThresholdBytes < 0
    ) {
      throw new RangeError(
        'Snapshot compression threshold must be non-negative',
      );
    }
  }

  save(snapshot: StoredRoomSnapshot): void {
    if (
      snapshot.state.room.roomId !== snapshot.roomId ||
      snapshot.state.room.version !== snapshot.stateVersion
    ) {
      throw new RangeError('Snapshot metadata does not match room state');
    }
    const json = Buffer.from(JSON.stringify(snapshot.state));
    const compressed = json.byteLength >= this.compressionThresholdBytes;
    const payload = compressed ? gzipSync(json) : json;
    this.database
      .prepare(
        `
        INSERT INTO snapshots (
          room_id, sequence, state_version, encoding, payload,
          checksum, created_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(room_id, sequence) DO UPDATE SET
          state_version = excluded.state_version,
          encoding = excluded.encoding,
          payload = excluded.payload,
          checksum = excluded.checksum,
          valid = 1,
          created_at_ms = excluded.created_at_ms
      `,
      )
      .run(
        snapshot.roomId,
        snapshot.sequence,
        snapshot.stateVersion,
        compressed ? 'gzip-json' : 'json',
        payload,
        checksum(payload),
        snapshot.createdAtMs,
      );
  }

  latest(roomId: string): StoredRoomSnapshot | null {
    const row = this.database
      .prepare(
        `
        SELECT room_id, sequence, state_version, encoding, payload,
               checksum, created_at_ms
        FROM snapshots
        WHERE room_id = ? AND valid = 1
        ORDER BY sequence DESC
        LIMIT 1
      `,
      )
      .get(roomId) as unknown as SnapshotRow | undefined;
    if (!row) return null;
    const storedPayload = Buffer.from(row.payload);
    if (checksum(storedPayload) !== row.checksum) {
      throw new SnapshotRecoveryError(
        'Snapshot checksum does not match payload',
      );
    }
    let json: Buffer;
    try {
      json =
        row.encoding === 'gzip-json'
          ? gunzipSync(storedPayload)
          : storedPayload;
    } catch (error) {
      throw new SnapshotRecoveryError(
        'Snapshot compression payload is invalid',
        {
          cause: error,
        },
      );
    }
    return Object.freeze({
      roomId: row.room_id,
      sequence: row.sequence,
      stateVersion: row.state_version,
      createdAtMs: row.created_at_ms,
      state: parseRecoveryState(json, row),
    });
  }
}
