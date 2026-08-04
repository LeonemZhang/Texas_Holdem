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
import { SqliteRoomRecordCatalog } from './persistence/sqlite-room-record-catalog.js';
import { UdpDiscoveryResponder } from '@texas-holdem/lan-discovery';
import { currentDiscoverySummary } from './application/discovery-summary.js';
import {
  parentPidFromEnvironment,
  startParentProcessMonitor,
} from './parent-process-monitor.js';
import {
  RoomRecordManagementRequestSchema,
  type RoomRecordManagementResponse,
} from '@texas-holdem/protocol';
import { RoomRecordManagementService } from './application/room-record-management.js';

interface HostControlParentPort {
  on(
    event: 'message',
    listener: (event: { readonly data: unknown }) => void,
  ): void;
  postMessage(message: unknown): void;
}

const currentDirectory = dirname(fileURLToPath(import.meta.url));
const defaultStaticDirectory = resolve(currentDirectory, '../../client/dist');
const port = Number.parseInt(process.env.HOST_PORT ?? '32100', 10);
const address = process.env.HOST_ADDRESS ?? '0.0.0.0';
const advertisedHost = process.env.HOST_ADVERTISED_ADDRESS ?? '127.0.0.1';
const networkName = process.env.HOST_NETWORK_NAME?.trim() || '本机网卡';
const hostMode = process.env.HOST_MODE === 'management' ? 'management' : 'room';
const staticDirectory = process.env.CLIENT_DIST_DIR ?? defaultStaticDirectory;
const dataDirectory = process.env.HOST_DATA_DIR?.trim() || null;
const discoveryPort = Number.parseInt(
  process.env.HOST_DISCOVERY_PORT ?? '32101',
  10,
);
const hostInstanceId = process.env.HOST_INSTANCE_ID?.trim() || null;

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
const runtimeStore = database
  ? new SqliteGameRuntimeStore(
      database,
      hostMode === 'room'
        ? { name: networkName, address: advertisedHost }
        : null,
    )
  : null;
const statisticsStore = database ? new SqliteStatisticsStore(database) : null;
const roomRecordCatalog = database
  ? new SqliteRoomRecordCatalog(database)
  : null;
const runtime = new GameRuntime(
  runtimeStore
    ? {
        sessionFallback: (credentials) =>
          runtimeStore.authenticate(credentials),
        ...(statisticsStore ? { statisticsStore } : {}),
      }
    : {},
);
const roomRecordManagement =
  runtimeStore && roomRecordCatalog
    ? new RoomRecordManagementService(runtime, roomRecordCatalog, runtimeStore)
    : null;
const stopPersistence = runtime.onStateCommitted((roomId) => {
  const state = runtime.exportState(roomId);
  if (state) runtimeStore?.save(state, Date.now());
});
const host =
  hostMode === 'room'
    ? await createHostServer({
        staticDirectory,
        advertisedHost,
        port,
        commandDispatcher: runtime,
        sessionAuthenticator: runtime,
        reconnectSynchronizer: runtime.reconnect,
        roomSessionService: runtime,
        snapshotProvider: (roomId, playerId) =>
          runtime.snapshot(roomId, playerId),
        roomSnapshotsProvider: (roomId) => runtime.snapshotsForRoom(roomId),
        onClosedRoomPublished: (roomId) => runtime.retireClosedRoom(roomId),
      })
    : null;
const stopAutomaticUpdates = runtime.onAutomaticStateChange((roomId) => {
  for (const snapshot of runtime.snapshotsForRoom(roomId)) {
    host?.publisher.publishSnapshot(snapshot);
  }
});
const discovery =
  hostMode === 'room'
    ? new UdpDiscoveryResponder({
        discoveryPort,
        advertisedAddress: advertisedHost,
        httpPort: port,
        roomSummary: () => currentDiscoverySummary(runtime),
      })
    : null;
let stopParentProcessMonitor: () => void = () => undefined;
let shuttingDown = false;
const parentPort = (
  process as NodeJS.Process & {
    readonly parentPort?: HostControlParentPort;
  }
).parentPort;

function managementFailure(
  requestId: string,
  error: unknown,
): RoomRecordManagementResponse {
  const message = error instanceof Error ? error.message : 'Management failed';
  return {
    protocolVersion: '1',
    requestId,
    status: 'rejected',
    error: {
      code: message.includes('does not exist') ? 'NOT_FOUND' : 'CONFLICT',
      message,
    },
  };
}

parentPort?.on('message', ({ data }) => {
  const parsed = RoomRecordManagementRequestSchema.safeParse(data);
  if (!parsed.success) return;
  if (!roomRecordManagement) {
    parentPort.postMessage({
      protocolVersion: '1',
      requestId: parsed.data.requestId,
      status: 'rejected',
      error: {
        code: 'INVALID_REQUEST',
        message: 'Room record management requires local persistence',
      },
    });
    return;
  }
  try {
    let result: unknown;
    switch (parsed.data.type) {
      case 'room-record.list':
        result = {
          records: roomRecordManagement.listRecords(
            parsed.data.includeArchived,
          ),
        };
        break;
      case 'room-record.create':
        result = {
          session: roomRecordManagement.createRecord(
            parsed.data,
            `http://${advertisedHost}:${port}`,
          ),
        };
        break;
      case 'room-record.recover':
        result = {
          session: roomRecordManagement.recoverRecord(
            parsed.data.roomId,
            `http://${advertisedHost}:${port}`,
          ),
        };
        break;
      case 'room-record.close-running': {
        const roomId = roomRecordManagement.closeRunningRecord(
          parsed.data.roomId,
        );
        for (const snapshot of runtime.snapshotsForRoom(roomId)) {
          host?.publisher.publishSnapshot(snapshot);
        }
        runtime.retireClosedRoom(roomId);
        result = null;
        break;
      }
      case 'room-record.archive':
        roomRecordManagement.archiveRecord(parsed.data.roomId);
        result = null;
        break;
      case 'room-record.restore':
        roomRecordManagement.restoreArchivedRecord(parsed.data.roomId);
        result = null;
        break;
      case 'room-record.delete':
        roomRecordManagement.deleteArchivedRecord(parsed.data.roomId);
        result = null;
        break;
      case 'room-record.get':
        result = { record: roomRecordManagement.getRecord(parsed.data.roomId) };
        break;
    }
    parentPort.postMessage({
      protocolVersion: '1',
      requestId: parsed.data.requestId,
      status: 'accepted',
      result,
    });
  } catch (error) {
    parentPort.postMessage(managementFailure(parsed.data.requestId, error));
  }
});

try {
  if (hostMode === 'room') {
    await host!.app.listen({ host: address, port });
    try {
      await discovery!.start();
    } catch (error) {
      process.stderr.write(
        `LAN discovery unavailable; direct IP remains enabled: ${error instanceof Error ? error.message : String(error)}\n`,
      );
    }
    process.stdout.write(
      `Texas Hold’em host listening on ${address}:${port}\n`,
    );
  } else {
    process.stdout.write('Texas Hold’em record management ready\n');
  }
  if (hostInstanceId) {
    parentPort?.postMessage({ type: 'host.ready', instanceId: hostInstanceId });
  }
  stopParentProcessMonitor = startParentProcessMonitor({
    parentPid: parentPidFromEnvironment(),
    onParentExit: () => shutdown(),
  });
} catch (error) {
  await host?.close();
  throw error;
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  stopParentProcessMonitor();
  stopPersistence();
  stopAutomaticUpdates();
  runtime.dispose();
  await discovery?.close();
  await host?.close();
  database?.close();
  process.exit(0);
}

process.once('SIGINT', () => void shutdown());
process.once('SIGTERM', () => void shutdown());
