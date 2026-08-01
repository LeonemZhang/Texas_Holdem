import { DatabaseSync } from 'node:sqlite';

export interface SqliteMigration {
  readonly version: number;
  readonly name: string;
  up(database: DatabaseSync): void;
}

interface AppliedMigrationRow {
  readonly version: number;
  readonly name: string;
}

function validateMigrations(migrations: readonly SqliteMigration[]): void {
  const versions = new Set<number>();
  for (const migration of migrations) {
    if (!Number.isSafeInteger(migration.version) || migration.version <= 0) {
      throw new RangeError('Migration version must be a positive integer');
    }
    if (!migration.name.trim())
      throw new RangeError('Migration name is required');
    if (versions.has(migration.version)) {
      throw new RangeError(`Duplicate migration version: ${migration.version}`);
    }
    versions.add(migration.version);
  }
}

export function openSqliteDatabase(path: string): DatabaseSync {
  if (!path.trim()) throw new RangeError('SQLite path cannot be empty');
  const database = new DatabaseSync(path);
  database.exec('PRAGMA foreign_keys = ON');
  database.exec('PRAGMA busy_timeout = 5000');
  database.exec('PRAGMA journal_mode = WAL');
  return database;
}

export function runSqliteMigrations(
  database: DatabaseSync,
  migrations: readonly SqliteMigration[],
): void {
  validateMigrations(migrations);
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) STRICT
  `);
  const applied = new Map(
    (
      database
        .prepare('SELECT version, name FROM schema_migrations ORDER BY version')
        .all() as unknown as AppliedMigrationRow[]
    ).map((migration) => [migration.version, migration.name]),
  );
  const insert = database.prepare(
    'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
  );

  for (const migration of [...migrations].sort(
    (left, right) => left.version - right.version,
  )) {
    const existingName = applied.get(migration.version);
    if (existingName !== undefined) {
      if (existingName !== migration.name) {
        throw new Error(
          `Migration ${migration.version} was applied as ${existingName}, not ${migration.name}`,
        );
      }
      continue;
    }
    database.exec('BEGIN IMMEDIATE');
    try {
      migration.up(database);
      insert.run(migration.version, migration.name);
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
  }
}
