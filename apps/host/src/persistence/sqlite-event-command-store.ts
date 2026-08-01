import type { DatabaseSync } from 'node:sqlite';

import {
  CommandResponseSchema,
  DomainEventSchema,
  type CommandResponse,
  type DomainEvent,
} from '@texas-holdem/protocol';

import type {
  CommandResultStorePort,
  EventStorePort,
  PersistenceUnitOfWork,
  StoredCommandResult,
  TransactionPort,
} from '../application/persistence-ports.js';

interface JsonRow {
  readonly payload_json: string;
}

interface ResponseRow {
  readonly response_json: string;
}

interface SequenceRow {
  readonly latest_sequence: number | null;
}

export class SqliteEventStore implements EventStorePort {
  constructor(
    private readonly database: DatabaseSync,
    private readonly nowMs: () => number,
  ) {}

  append(events: readonly DomainEvent[]): void {
    const insert = this.database.prepare(`
      INSERT INTO events (
        room_id, sequence, event_id, state_version, event_type,
        payload_json, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const candidate of events) {
      const event = DomainEventSchema.parse(candidate);
      insert.run(
        event.roomId,
        event.sequence,
        event.eventId,
        event.stateVersion,
        event.type,
        JSON.stringify(event),
        this.nowMs(),
      );
    }
  }

  readAfter(roomId: string, sequence: number): readonly DomainEvent[] {
    return Object.freeze(
      (
        this.database
          .prepare(
            `
            SELECT payload_json FROM events
            WHERE room_id = ? AND sequence > ?
            ORDER BY sequence
          `,
          )
          .all(roomId, sequence) as unknown as JsonRow[]
      ).map(({ payload_json: payload }) =>
        DomainEventSchema.parse(JSON.parse(payload)),
      ),
    );
  }

  latestSequence(roomId: string): number {
    const row = this.database
      .prepare(
        'SELECT MAX(sequence) latest_sequence FROM events WHERE room_id = ?',
      )
      .get(roomId) as unknown as SequenceRow;
    return row.latest_sequence ?? 0;
  }
}

export class SqliteCommandResultStore implements CommandResultStorePort {
  constructor(
    private readonly database: DatabaseSync,
    private readonly nowMs: () => number,
  ) {}

  save(result: StoredCommandResult): void {
    this.database
      .prepare(
        `
        INSERT INTO command_results (
          room_id, player_id, command_id, response_json, created_at_ms
        ) VALUES (?, ?, ?, ?, ?)
      `,
      )
      .run(
        result.roomId,
        result.playerId,
        result.commandId,
        JSON.stringify(CommandResponseSchema.parse(result.response)),
        this.nowMs(),
      );
  }

  find(
    roomId: string,
    playerId: string,
    commandId: string,
  ): StoredCommandResult | null {
    const row = this.database
      .prepare(
        `
        SELECT response_json FROM command_results
        WHERE room_id = ? AND player_id = ? AND command_id = ?
      `,
      )
      .get(roomId, playerId, commandId) as unknown as ResponseRow | undefined;
    if (!row) return null;
    const response: CommandResponse = CommandResponseSchema.parse(
      JSON.parse(row.response_json),
    );
    return Object.freeze({ roomId, playerId, commandId, response });
  }
}

export class SqliteTransactionStore implements TransactionPort {
  constructor(
    private readonly database: DatabaseSync,
    private readonly stores: PersistenceUnitOfWork,
  ) {}

  run<Result>(operation: (stores: PersistenceUnitOfWork) => Result): Result {
    this.database.exec('BEGIN IMMEDIATE');
    try {
      const result = operation(this.stores);
      this.database.exec('COMMIT');
      return result;
    } catch (error) {
      this.database.exec('ROLLBACK');
      throw error;
    }
  }
}
