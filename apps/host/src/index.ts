import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { createHostServer } from './server.js';
import { GameRuntime } from './application/game-runtime.js';
import { HOST_MIGRATIONS } from './persistence/migrations.js';
import {
  openSqliteDatabase,
  runSqliteMigrations,
} from './persistence/sqlite-database.js';
import { SqliteGameRuntimeStore } from './persistence/sqlite-game-runtime-store.js';
import { SqliteStatisticsStore } from './persistence/sqlite-statistics-store.js';
import { UdpDiscoveryResponder } from '@texas-holdem/lan-discovery';
import { currentDiscoverySummary } from './application/discovery-summary.js';

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const defaultStaticDirectory = resolve(currentDirectory, '../../client/dist');
const port = Number.parseInt(process.env.HOST_PORT ?? '32100', 10);
const address = process.env.HOST_ADDRESS ?? '0.0.0.0';
const advertisedHost = process.env.HOST_ADVERTISED_ADDRESS ?? '127.0.0.1';
const staticDirectory = process.env.CLIENT_DIST_DIR ?? defaultStaticDirectory;
const dataDirectory = process.env.HOST_DATA_DIR?.trim() || null;
const discoveryPort = Number.parseInt(
  process.env.HOST_DISCOVERY_PORT ?? '32101',
  10,
);

if (!Number.isSafeInteger(port) || port <= 0 || port > 65_535) {
  throw new Error(`Invalid HOST_PORT: ${process.env.HOST_PORT ?? ''}`);
}
if (
  !Number.isSafeInteger(discoveryPort) ||
  discoveryPort <= 0 ||
  discoveryPort > 65_535
) {
  throw new Error(
    `Invalid HOST_DISCOVERY_PORT: ${process.env.HOST_DISCOVERY_PORT ?? ''}`,
  );
}

const database = dataDirectory
  ? (() => {
      mkdirSync(dataDirectory, { recursive: true });
      const opened = openSqliteDatabase(join(dataDirectory, 'room.sqlite'));
      runSqliteMigrations(opened, HOST_MIGRATIONS);
      return opened;
    })()
  : null;
const runtimeStore = database ? new SqliteGameRuntimeStore(database) : null;
const statisticsStore = database ? new SqliteStatisticsStore(database) : null;
const runtime = new GameRuntime(
  runtimeStore
    ? {
        sessionFallback: (credentials) =>
          runtimeStore.authenticate(credentials),
        ...(statisticsStore ? { statisticsStore } : {}),
      }
    : {},
);
const recovered = runtimeStore?.loadLatest();
if (recovered) runtime.restore(recovered.state, recovered.sequence);
const stopPersistence = runtime.onStateCommitted((roomId) => {
  const state = runtime.exportState(roomId);
  if (state) runtimeStore?.save(state, Date.now());
});
const host = await createHostServer({
  staticDirectory,
  advertisedHost,
  port,
  commandDispatcher: runtime,
  sessionAuthenticator: runtime.sessions,
  reconnectSynchronizer: runtime.reconnect,
  roomSessionService: runtime,
  snapshotProvider: (roomId, playerId) => runtime.snapshot(roomId, playerId),
  roomSnapshotsProvider: (roomId) => runtime.snapshotsForRoom(roomId),
});
const stopAutomaticUpdates = runtime.onAutomaticStateChange((roomId) => {
  for (const snapshot of runtime.snapshotsForRoom(roomId)) {
    host.publisher.publishSnapshot(snapshot);
  }
});
const discovery = new UdpDiscoveryResponder({
  discoveryPort,
  advertisedAddress: advertisedHost,
  httpPort: port,
  roomSummary: () => currentDiscoverySummary(runtime),
});

try {
  await host.app.listen({ host: address, port });
  try {
    await discovery.start();
  } catch (error) {
    process.stderr.write(
      `LAN discovery unavailable; direct IP remains enabled: ${error instanceof Error ? error.message : String(error)}\n`,
    );
  }
  process.stdout.write(`Texas Hold’em host listening on ${address}:${port}\n`);
} catch (error) {
  await host.close();
  throw error;
}

async function shutdown() {
  stopPersistence();
  stopAutomaticUpdates();
  runtime.dispose();
  await discovery.close();
  await host.close();
  database?.close();
  process.exitCode = 0;
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
