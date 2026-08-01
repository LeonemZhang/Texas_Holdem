import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  openSqliteDatabase,
  runSqliteMigrations,
  type SqliteMigration,
} from './sqlite-database.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

async function temporaryDatabase() {
  const directory = await mkdtemp(join(tmpdir(), 'texas-holdem-sqlite-'));
  temporaryDirectories.push(directory);
  return openSqliteDatabase(join(directory, 'room.sqlite'));
}

describe('SQLite migration runner', () => {
  it('migrates a new database and skips an already applied version', async () => {
    const database = await temporaryDatabase();
    const migrations: SqliteMigration[] = [
      {
        version: 1,
        name: 'create_example',
        up: (connection) =>
          connection.exec(
            'CREATE TABLE example (id INTEGER PRIMARY KEY) STRICT',
          ),
      },
    ];
    try {
      runSqliteMigrations(database, migrations);
      runSqliteMigrations(database, migrations);

      const migrationCount = database
        .prepare('SELECT COUNT(*) count FROM schema_migrations')
        .get() as unknown as { count: number };
      expect(migrationCount.count).toBe(1);
      expect(
        database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='example'",
          )
          .get(),
      ).toBeDefined();
    } finally {
      database.close();
    }
  });

  it('rolls back all statements and the version record when a migration fails', async () => {
    const database = await temporaryDatabase();
    const broken: SqliteMigration = {
      version: 1,
      name: 'broken_migration',
      up: (connection) => {
        connection.exec(
          'CREATE TABLE half_applied (id INTEGER PRIMARY KEY) STRICT',
        );
        throw new Error('simulated migration failure');
      },
    };
    try {
      expect(() => runSqliteMigrations(database, [broken])).toThrow(
        'simulated migration failure',
      );
      expect(
        database
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='half_applied'",
          )
          .get(),
      ).toBeUndefined();
      const migrationCount = database
        .prepare('SELECT COUNT(*) count FROM schema_migrations')
        .get() as unknown as { count: number };
      expect(migrationCount.count).toBe(0);
    } finally {
      database.close();
    }
  });
});
