import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { HandSummaryEvent } from '@texas-holdem/poker-core';
import { PROTOCOL_VERSION } from '@texas-holdem/protocol';

import { rebuildStatistics } from '../application/statistics-store.js';
import { HOST_MIGRATIONS } from './migrations.js';
import { openSqliteDatabase, runSqliteMigrations } from './sqlite-database.js';
import { SqliteEventStore } from './sqlite-event-command-store.js';
import { SqliteStatisticsStore } from './sqlite-statistics-store.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

const summary: HandSummaryEvent = {
  type: 'hand.summary',
  handId: 'hand-1',
  reason: 'showdown',
  buttonIndex: 0,
  participants: [
    { playerId: 'alice', seatIndex: 0 },
    { playerId: 'bob', seatIndex: 1 },
  ],
  communityCards: ['2c', '3d', '4h', '5s', '9c'],
  investments: { alice: 50, bob: 50 },
  pots: [{ amount: 100, winnerIds: ['alice'] }],
  winnerIds: ['alice'],
  payouts: { alice: 100, bob: 0 },
  netChanges: { alice: 50, bob: -50 },
  revealedHoleCards: { alice: ['As', 'Ad'], bob: ['Ks', 'Kd'] },
};

describe('SQLite statistics fact store', () => {
  it('rebuilds identical statistics after deleting the disposable cache', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'texas-holdem-statistics-'));
    temporaryDirectories.push(directory);
    const database = openSqliteDatabase(join(directory, 'room.sqlite'));
    runSqliteMigrations(database, HOST_MIGRATIONS);
    database
      .prepare(
        `
        INSERT INTO rooms (
          room_id, host_player_id, phase, state_version, settings_json,
          created_at_ms, updated_at_ms
        ) VALUES ('room-1', 'alice', 'playing', 1, '{}', 1, 1)
      `,
      )
      .run();
    const events = new SqliteEventStore(database, () => 2);
    events.append([
      {
        protocolVersion: PROTOCOL_VERSION,
        eventId: 'summary-1',
        roomId: 'room-1',
        sequence: 1,
        stateVersion: 1,
        type: 'hand.summary',
        handId: 'hand-1',
        reason: 'showdown',
        communityCards: [...summary.communityCards],
        investments: summary.investments,
        winnerIds: [...summary.winnerIds],
        payouts: summary.payouts,
        netChanges: summary.netChanges,
        revealedHoleCards: Object.fromEntries(
          Object.entries(summary.revealedHoleCards).map(([playerId, cards]) => [
            playerId,
            [...cards],
          ]),
        ),
      },
    ]);
    const store = new SqliteStatisticsStore(database);
    try {
      store.saveSummary('room-1', 1, summary, 2);
      store.saveFacts(
        'room-1',
        [
          {
            factId: 'fact-action',
            event: {
              type: 'player.action',
              handId: 'hand-1',
              playerId: 'bob',
              action: 'allIn',
              street: 'river',
            },
          },
          {
            factId: 'fact-loss',
            event: {
              type: 'showdown.heads-up-loss',
              handId: 'hand-1',
              loserPlayerId: 'bob',
              winnerPlayerId: 'alice',
              contenderCount: 2,
            },
          },
        ],
        2,
      );
      const initial = { alice: 100, bob: 100 };
      const rebuilt = rebuildStatistics(store, 'room-1', initial);
      database
        .prepare(
          `
          INSERT INTO statistics_cache (room_id, cache_json, rebuilt_at_ms)
          VALUES ('room-1', '{"incorrect":true}', 3)
        `,
        )
        .run();
      database
        .prepare("DELETE FROM statistics_cache WHERE room_id = 'room-1'")
        .run();
      const rebuiltWithoutCache = rebuildStatistics(store, 'room-1', initial);

      expect(rebuiltWithoutCache).toEqual(rebuilt);
      expect(rebuilt.basic.alice).toMatchObject({
        currentChips: 150,
        participatedHands: 1,
        wonHands: 1,
      });
      expect(rebuilt.facts.bob).toMatchObject({
        allInCount: 1,
        headsUpShowdownLosses: 1,
      });
      expect(
        rebuilt.titles.find(({ title }) => title === 'unlucky-player')
          ?.playerIds,
      ).toEqual(['bob']);
      expect(store.loadSummaries('room-1')).toEqual([summary]);
    } finally {
      database.close();
    }
  });
});
