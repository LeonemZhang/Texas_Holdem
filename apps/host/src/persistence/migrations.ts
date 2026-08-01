import type { SqliteMigration } from './sqlite-database.js';

export const HOST_MIGRATIONS: readonly SqliteMigration[] = Object.freeze([
  {
    version: 1,
    name: 'create_room_event_snapshot_schema',
    up: (database) => {
      database.exec(`
        CREATE TABLE rooms (
          room_id TEXT PRIMARY KEY,
          host_player_id TEXT NOT NULL,
          phase TEXT NOT NULL CHECK (
            phase IN ('lobby', 'playing', 'hand-ready', 'paused', 'closed')
          ),
          state_version INTEGER NOT NULL CHECK (state_version >= 0),
          normal_closed INTEGER NOT NULL DEFAULT 0 CHECK (normal_closed IN (0, 1)),
          settings_json TEXT NOT NULL CHECK (json_valid(settings_json)),
          created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
          updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms),
          CHECK (normal_closed = 0 OR phase = 'closed')
        ) STRICT;

        CREATE TABLE players (
          room_id TEXT NOT NULL,
          player_id TEXT NOT NULL,
          nickname TEXT NOT NULL COLLATE NOCASE,
          seat_index INTEGER NOT NULL CHECK (seat_index BETWEEN 0 AND 9),
          chips INTEGER NOT NULL CHECK (chips >= 0),
          status TEXT NOT NULL CHECK (
            status IN (
              'waiting', 'active', 'sitting-out', 'eliminated',
              'left', 'disconnected'
            )
          ),
          is_host INTEGER NOT NULL CHECK (is_host IN (0, 1)),
          lobby_ready INTEGER NOT NULL DEFAULT 0 CHECK (lobby_ready IN (0, 1)),
          PRIMARY KEY (room_id, player_id),
          UNIQUE (room_id, seat_index),
          UNIQUE (room_id, nickname),
          FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE
        ) STRICT;

        CREATE TABLE events (
          room_id TEXT NOT NULL,
          sequence INTEGER NOT NULL CHECK (sequence > 0),
          event_id TEXT NOT NULL,
          state_version INTEGER NOT NULL CHECK (state_version >= 0),
          event_type TEXT NOT NULL,
          payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
          created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
          PRIMARY KEY (room_id, sequence),
          UNIQUE (room_id, event_id),
          FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE
        ) STRICT;
        CREATE INDEX idx_events_room_sequence
          ON events (room_id, sequence);

        CREATE TABLE snapshots (
          room_id TEXT NOT NULL,
          sequence INTEGER NOT NULL CHECK (sequence >= 0),
          state_version INTEGER NOT NULL CHECK (state_version >= 0),
          encoding TEXT NOT NULL CHECK (encoding IN ('json', 'gzip-json')),
          payload BLOB NOT NULL,
          checksum TEXT NOT NULL,
          valid INTEGER NOT NULL DEFAULT 1 CHECK (valid IN (0, 1)),
          created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
          PRIMARY KEY (room_id, sequence),
          FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE
        ) STRICT;
        CREATE INDEX idx_snapshots_room_latest
          ON snapshots (room_id, valid, sequence DESC);
      `);
    },
  },
  {
    version: 2,
    name: 'create_command_results',
    up: (database) => {
      database.exec(`
        CREATE TABLE command_results (
          room_id TEXT NOT NULL,
          player_id TEXT NOT NULL,
          command_id TEXT NOT NULL,
          response_json TEXT NOT NULL CHECK (json_valid(response_json)),
          created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
          PRIMARY KEY (room_id, player_id, command_id),
          FOREIGN KEY (room_id) REFERENCES rooms(room_id) ON DELETE CASCADE
        ) STRICT
      `);
    },
  },
]);
