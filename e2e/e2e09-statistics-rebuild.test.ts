import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { HandSummaryEvent } from '../packages/poker-core/src/index.js';
import { rebuildStatistics } from '../apps/host/src/application/statistics-store.js';
import { HOST_MIGRATIONS } from '../apps/host/src/persistence/migrations.js';
import {
  openSqliteDatabase,
  runSqliteMigrations,
} from '../apps/host/src/persistence/sqlite-database.js';
import { SqliteStatisticsStore } from '../apps/host/src/persistence/sqlite-statistics-store.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

function summary(hand: number): HandSummaryEvent {
  const showdown = hand === 1;
  return {
    type: 'hand.summary',
    handId: `hand-${hand}`,
    reason: showdown ? 'showdown' : 'uncontested',
    buttonIndex: hand % 2,
    participants: [
      { playerId: 'alice', seatIndex: 0 },
      { playerId: 'bob', seatIndex: 1 },
    ],
    communityCards: showdown ? ['2c', '3d', '4h', '5s', '9c'] : [],
    investments: { alice: 10, bob: 10 },
    pots: [{ amount: 20, winnerIds: ['alice'] }],
    winnerIds: ['alice'],
    payouts: { alice: 20, bob: 0 },
    netChanges: { alice: 10, bob: -10 },
    revealedHoleCards: showdown
      ? { alice: ['As', 'Ad'], bob: ['Ks', 'Kd'] }
      : {},
  };
}

describe('E2E09 statistics and fun-title rebuild', () => {
  it('rebuilds identical rankings and every traceable title after reopening SQLite', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'texas-holdem-e2e09-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'room.sqlite');
    const database = openSqliteDatabase(path);
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
    const store = new SqliteStatisticsStore(database);
    const insertEvent = database.prepare(
      `
      INSERT INTO events (
        room_id, sequence, event_id, state_version, event_type,
        payload_json, created_at_ms
      ) VALUES (?, ?, ?, ?, 'hand.summary', '{}', ?)
    `,
    );
    for (let hand = 1; hand <= 10; hand += 1) {
      insertEvent.run('room-1', hand, `summary-${hand}`, hand, hand);
      store.saveSummary('room-1', hand, summary(hand), hand);
    }
    store.saveFacts(
      'room-1',
      [
        ...Array.from({ length: 10 }, (_, index) => ({
          factId: `bob-fold-${index + 1}`,
          event: {
            type: 'player.action' as const,
            handId: `hand-${index + 1}`,
            playerId: 'bob',
            action: 'fold' as const,
            street: 'preflop' as const,
          },
        })),
        {
          factId: 'alice-all-in',
          event: {
            type: 'player.action',
            handId: 'hand-1',
            playerId: 'alice',
            action: 'allIn',
            street: 'river',
          },
        },
        {
          factId: 'bob-unlucky',
          event: {
            type: 'showdown.heads-up-loss',
            handId: 'hand-1',
            loserPlayerId: 'bob',
            winnerPlayerId: 'alice',
            contenderCount: 2,
          },
        },
        {
          factId: 'alice-river-comeback',
          event: {
            type: 'showdown.river-comeback',
            handId: 'hand-1',
            winnerPlayerId: 'alice',
            leadersBeforeRiver: ['bob'],
          },
        },
      ],
      11,
    );
    const initialChips = { alice: 100, bob: 100 };
    const beforeRestart = rebuildStatistics(store, 'room-1', initialChips);
    database.close();

    const reopened = openSqliteDatabase(path);
    try {
      runSqliteMigrations(reopened, HOST_MIGRATIONS);
      const reopenedStore = new SqliteStatisticsStore(reopened);
      const rebuilt = rebuildStatistics(reopenedStore, 'room-1', initialChips);

      expect(rebuilt).toEqual(beforeRestart);
      expect(rebuilt.basic.alice).toMatchObject({
        currentChips: 200,
        participatedHands: 10,
        wonHands: 10,
      });
      expect(rebuilt.basic.bob?.preflopFoldCount).toBe(10);
      expect(rebuilt.titles.map(({ title }) => title)).toEqual([
        'all-in-king',
        'unlucky-player',
        'pot-harvester',
        'double-up-master',
        'bluff-king',
        'river-killer',
        'tight-player',
      ]);
      expect(
        rebuilt.titles.every(({ playerIds }) => playerIds.length > 0),
      ).toBe(true);
      expect(reopenedStore.loadSummaries('room-1')).toHaveLength(10);
      expect(reopenedStore.loadFacts('room-1')).toHaveLength(13);
    } finally {
      reopened.close();
    }
  });
});
