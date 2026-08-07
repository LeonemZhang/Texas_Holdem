import type { DatabaseSync } from 'node:sqlite';

import type { HandSummaryEvent } from '@texas-holdem/poker-core';

import type {
  StatisticsFactStorePort,
  StoredStatisticsFact,
} from '../application/statistics-store.js';
import type { StatisticsFactEvent } from '../statistics/fact-statistics.js';

interface JsonRow {
  readonly payload: string;
}

function parseSummary(payload: string): HandSummaryEvent {
  const parsed = JSON.parse(payload) as HandSummaryEvent;
  if (parsed.type !== 'hand.summary' || !parsed.handId) {
    throw new RangeError('Stored hand summary is invalid');
  }
  return Object.freeze(parsed);
}

function parseFact(payload: string): StatisticsFactEvent {
  const parsed = JSON.parse(payload) as StatisticsFactEvent;
  if (
    ![
      'player.action',
      'showdown.heads-up-loss',
      'showdown.river-comeback',
    ].includes(parsed.type)
  ) {
    throw new RangeError('Stored statistics fact is invalid');
  }
  return Object.freeze(parsed);
}

export class SqliteStatisticsStore implements StatisticsFactStorePort {
  constructor(private readonly database: DatabaseSync) {}

  saveSummary(
    roomId: string,
    sequence: number,
    summary: HandSummaryEvent,
    createdAtMs: number,
  ): void {
    if (summary.type !== 'hand.summary') {
      throw new RangeError('Only hand summaries can be persisted here');
    }
    this.database
      .prepare(
        `
        INSERT OR IGNORE INTO events (
          room_id, sequence, event_id, state_version, event_type,
          payload_json, created_at_ms
        )
        SELECT room_id, ?, ?, state_version, 'hand.summary', ?, ?
        FROM rooms WHERE room_id = ?
      `,
      )
      .run(
        sequence,
        `statistics-summary-${summary.handId}`,
        JSON.stringify(summary),
        createdAtMs,
        roomId,
      );
    this.database
      .prepare(
        `
        INSERT INTO hand_summaries (
          room_id, hand_id, sequence, summary_json, created_at_ms
        ) VALUES (?, ?, ?, ?, ?)
      `,
      )
      .run(
        roomId,
        summary.handId,
        sequence,
        JSON.stringify(summary),
        createdAtMs,
      );
  }

  updateSummary(roomId: string, summary: HandSummaryEvent): void {
    const payload = JSON.stringify(summary);
    this.database
      .prepare(
        `
        UPDATE hand_summaries
        SET summary_json = ?
        WHERE room_id = ? AND hand_id = ?
      `,
      )
      .run(payload, roomId, summary.handId);
    this.database
      .prepare(
        `
        UPDATE events
        SET payload_json = ?
        WHERE room_id = ? AND event_id = ?
      `,
      )
      .run(payload, roomId, `statistics-summary-${summary.handId}`);
  }

  saveFacts(
    roomId: string,
    facts: readonly StoredStatisticsFact[],
    createdAtMs: number,
  ): void {
    const insert = this.database.prepare(`
      INSERT INTO statistics_facts (
        room_id, fact_id, hand_id, fact_type, payload_json, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const fact of facts) {
      insert.run(
        roomId,
        fact.factId,
        fact.event.handId,
        fact.event.type,
        JSON.stringify(fact.event),
        createdAtMs,
      );
    }
  }

  loadSummaries(roomId: string): readonly HandSummaryEvent[] {
    return Object.freeze(
      (
        this.database
          .prepare(
            `
            SELECT summary_json payload FROM hand_summaries
            WHERE room_id = ? ORDER BY sequence
          `,
          )
          .all(roomId) as unknown as JsonRow[]
      ).map(({ payload }) => parseSummary(payload)),
    );
  }

  loadFacts(roomId: string): readonly StatisticsFactEvent[] {
    return Object.freeze(
      (
        this.database
          .prepare(
            `
            SELECT payload_json payload FROM statistics_facts
            WHERE room_id = ? ORDER BY created_at_ms, fact_id
          `,
          )
          .all(roomId) as unknown as JsonRow[]
      ).map(({ payload }) => parseFact(payload)),
    );
  }
}
