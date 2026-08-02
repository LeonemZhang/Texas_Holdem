import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { PROTOCOL_VERSION } from '@texas-holdem/protocol';

import { GameRuntime } from '../application/game-runtime.js';
import { HOST_MIGRATIONS } from './migrations.js';
import { openSqliteDatabase, runSqliteMigrations } from './sqlite-database.js';
import { SqliteGameRuntimeStore } from './sqlite-game-runtime-store.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('SqliteGameRuntimeStore', () => {
  it('restores the authoritative room and hashed reconnect identities', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'texas-runtime-store-'));
    temporaryDirectories.push(directory);
    const path = join(directory, 'room.sqlite');
    const firstDatabase = openSqliteDatabase(path);
    runSqliteMigrations(firstDatabase, HOST_MIGRATIONS);
    const firstStore = new SqliteGameRuntimeStore(firstDatabase);
    const firstRuntime = new GameRuntime({
      sessionFallback: (credentials) => firstStore.authenticate(credentials),
    });
    firstRuntime.onStateCommitted((roomId) => {
      const state = firstRuntime.exportState(roomId);
      if (state) firstStore.save(state, 1);
    });
    const host = firstRuntime.create(
      {
        hostNickname: 'Alice',
        settings: {
          roomName: 'Friends',
          maxPlayers: 10,
          initialChips: 100,
          smallBlind: 1,
          actionTimeoutSeconds: 30,
          handReadyTimeoutSeconds: 30,
          blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
          zeroChipPolicy: 'request-chips',
        },
      },
      'http://10.126.126.1:32100',
    );
    const guest = firstRuntime.join(
      host.roomId,
      { nickname: 'Bob' },
      'http://10.126.126.1:32100',
    );
    firstRuntime.dispose();
    firstDatabase.close();

    const reopened = openSqliteDatabase(path);
    try {
      runSqliteMigrations(reopened, HOST_MIGRATIONS);
      const reopenedStore = new SqliteGameRuntimeStore(reopened);
      expect(reopenedStore.loadRecoverable('missing-room')).toBeNull();
      const loaded = reopenedStore.loadRecoverable(host.roomId);
      expect(loaded?.state.room.players).toHaveLength(2);
      const restored = new GameRuntime({
        sessionFallback: (credentials) =>
          reopenedStore.authenticate(credentials),
      });
      restored.restore(loaded!.state, loaded!.sequence);

      expect(
        restored.sessions.authenticate({
          protocolVersion: PROTOCOL_VERSION,
          roomId: guest.roomId,
          playerId: guest.playerId,
          token: guest.token,
        }),
      ).toEqual({ roomId: guest.roomId, playerId: guest.playerId });
      expect(
        restored.snapshot(host.roomId, host.playerId)?.room.players,
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ nickname: 'Alice', seatIndex: 0 }),
          expect.objectContaining({ nickname: 'Bob', seatIndex: 1 }),
        ]),
      );
      restored.dispose();

      reopened
        .prepare('UPDATE rooms SET archived = 1 WHERE room_id = ?')
        .run(host.roomId);
      expect(reopenedStore.loadRecoverable(host.roomId)).toBeNull();

      reopened
        .prepare(
          "UPDATE rooms SET archived = 0, phase = 'closed', normal_closed = 1 WHERE room_id = ?",
        )
        .run(host.roomId);
      expect(reopenedStore.loadRecoverable(host.roomId)).toBeNull();
    } finally {
      reopened.close();
    }
  });
});
