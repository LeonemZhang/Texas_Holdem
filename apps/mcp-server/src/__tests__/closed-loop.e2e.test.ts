import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createSocket } from 'node:dgram';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  CommandResponseSchema,
  LegalActionsSchema,
  PlayerSnapshotSchema,
  RoomRecordManagementResponseSchema,
  RoomSessionResponseSchema,
  type CommandResponse,
  type LegalActions,
  type PlayerSnapshot,
  type RoomSessionResponse,
} from '@texas-holdem/protocol';
import { io, type Socket } from 'socket.io-client';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const repositoryRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const hostEntry = join(repositoryRoot, 'apps', 'host', 'dist', 'index.js');
const mcpEntry = join(repositoryRoot, 'apps', 'mcp-server', 'dist', 'index.js');
const hostParentPortShim = join(
  repositoryRoot,
  'apps',
  'mcp-server',
  'src',
  '__tests__',
  'fixtures',
  'host-parent-port-shim.mjs',
);
const TARGET_COMPLETED_HANDS = 3;

const RecoveryTokenSchema = z.object({
  roomId: z.string().min(1),
  playerId: z.string().min(1),
  token: z.string().min(16),
});

const ConnectResultSchema = z.object({
  roomId: z.string().min(1),
  playerId: z.string().min(1),
  phase: z.enum(['lobby', 'playing', 'hand-ready', 'paused', 'closed']),
  recoveryToken: RecoveryTokenSchema,
});

const ObserveResultSchema = z.object({
  roomId: z.string().min(1),
  playerId: z.string().min(1),
  stateVersion: z.number().int().nonnegative(),
  phase: z.enum(['lobby', 'playing', 'hand-ready', 'paused', 'closed']),
  completedHands: z.number().int().nonnegative(),
  currentActorId: z.string().nullable(),
  isMyTurn: z.boolean(),
  legalActions: LegalActionsSchema.nullable(),
});

const WaitResultSchema = z.object({
  reason: z.enum([
    'your-turn',
    'lobby-ready',
    'hand-ready',
    'timeout',
    'error',
  ]),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
});

const SubmitResultSchema = z.object({
  accepted: z.boolean(),
  status: z.string(),
  stateVersion: z.number().int().nonnegative().nullable().optional(),
  error: z
    .object({ code: z.string(), message: z.string() })
    .nullable()
    .optional(),
});

const RecoveryResultSchema = z.object({
  session: RoomSessionResponseSchema,
});

interface StartedHost {
  readonly process: ChildProcess;
  readonly hostUrl: string;
  readonly databasePath: string;
  readonly output: () => string;
}

interface CountRow {
  readonly count: number;
}

interface RoomRow {
  readonly phase: string;
  readonly state_version: number;
  readonly normal_closed: number;
}

interface PlayerRow {
  readonly player_id: string;
  readonly nickname: string;
  readonly chips: number;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function freeTcpPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('Failed to reserve a TCP port');
  }
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

async function freeUdpPort(): Promise<number> {
  const socket = createSocket('udp4');
  await new Promise<void>((resolve, reject) => {
    socket.once('error', reject);
    socket.bind(0, '127.0.0.1', () => resolve());
  });
  const address = socket.address();
  await new Promise<void>((resolve) => socket.close(() => resolve()));
  return address.port;
}

async function waitForHealth(
  process: ChildProcess,
  hostUrl: string,
  output: () => string,
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (process.exitCode !== null || process.signalCode !== null) {
      throw new Error(`Host exited before readiness:\n${output()}`);
    }
    try {
      const response = await fetch(`${hostUrl}/health`, {
        signal: AbortSignal.timeout(500),
      });
      if (response.ok) return;
    } catch {
      // The process is still starting.
    }
    await delay(100);
  }
  throw new Error(`Host health check timed out:\n${output()}`);
}

async function startHost(dataDirectory: string): Promise<StartedHost> {
  const port = await freeTcpPort();
  const discoveryPort = await freeUdpPort();
  const hostUrl = `http://127.0.0.1:${port}`;
  const databasePath = join(dataDirectory, 'room.sqlite');
  const chunks: string[] = [];
  const hostProcess = spawn(
    process.execPath,
    ['--import', pathToFileURL(hostParentPortShim).href, hostEntry],
    {
      cwd: repositoryRoot,
      env: {
        ...globalThis.process.env,
        HOST_MODE: 'room',
        HOST_PORT: String(port),
        HOST_ADDRESS: '127.0.0.1',
        HOST_ADVERTISED_ADDRESS: '127.0.0.1',
        HOST_DISCOVERY_PORT: String(discoveryPort),
        HOST_DATA_DIR: dataDirectory,
        CLIENT_DIST_DIR: join(repositoryRoot, 'apps', 'client', 'dist'),
      },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    },
  );
  hostProcess.stdout?.on('data', (chunk: Buffer | string) => {
    chunks.push(String(chunk));
  });
  hostProcess.stderr?.on('data', (chunk: Buffer | string) => {
    chunks.push(String(chunk));
  });
  const output = () => chunks.join('');
  await waitForHealth(hostProcess, hostUrl, output);
  return { process: hostProcess, hostUrl, databasePath, output };
}

async function recoverRoom(
  startedHost: StartedHost,
  roomId: string,
): Promise<RoomSessionResponse> {
  const requestId = randomUUID();
  const response = await new Promise<unknown>((resolve, reject) => {
    const listener = (message: unknown) => {
      const parsed = RoomRecordManagementResponseSchema.safeParse(message);
      if (!parsed.success || parsed.data.requestId !== requestId) return;
      cleanup();
      resolve(parsed.data);
    };
    const cleanup = () => {
      clearTimeout(timeout);
      startedHost.process.off('message', listener);
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Host room recovery timed out'));
    }, 10_000);
    startedHost.process.on('message', listener);
    try {
      startedHost.process.send({
        protocolVersion: '3',
        requestId,
        type: 'room-record.recover',
        roomId,
      });
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
  const parsed = RoomRecordManagementResponseSchema.parse(response);
  if (parsed.status === 'rejected') {
    throw new Error(
      `Host room recovery was rejected: ${parsed.error.code} ${parsed.error.message}`,
    );
  }
  return RecoveryResultSchema.parse(parsed.result).session;
}

async function stopProcess(process: ChildProcess): Promise<void> {
  if (process.exitCode !== null || process.signalCode !== null) return;
  process.kill('SIGTERM');
  await Promise.race([once(process, 'exit'), delay(10_000)]);
  if (process.exitCode !== null || process.signalCode !== null) return;
  process.kill('SIGKILL');
  await once(process, 'exit');
}

async function createRoom(hostUrl: string): Promise<RoomSessionResponse> {
  const response = await fetch(`${hostUrl}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      hostNickname: '房主测试端',
      settings: {
        roomName: 'MCP 自闭环',
        maxPlayers: 2,
        initialChips: 1_000,
        smallBlind: 5,
        actionTimeoutSeconds: 10,
        handReadyTimeoutSeconds: 60,
        blindGrowth: {
          enabled: false,
          intervalHands: 100,
          multiplier: 2,
        },
        zeroChipPolicy: 'request-chips',
      },
    }),
  });
  if (!response.ok) {
    throw new Error(
      `Room creation failed (${response.status}): ${await response.text()}`,
    );
  }
  return RoomSessionResponseSchema.parse(await response.json());
}

class HostPlayerClient {
  private readonly socket: Socket;
  private latestSnapshot: PlayerSnapshot | null = null;

  constructor(
    hostUrl: string,
    readonly identity: RoomSessionResponse,
  ) {
    this.socket = io(hostUrl, {
      autoConnect: false,
      auth: {
        protocolVersion: '3',
        roomId: identity.roomId,
        playerId: identity.playerId,
        token: identity.token,
      },
      path: identity.socketPath,
      transports: ['websocket'],
      reconnection: false,
    });
    this.socket.on('state:snapshot', (raw: unknown) => {
      const parsed = PlayerSnapshotSchema.safeParse(raw);
      if (
        parsed.success &&
        (this.latestSnapshot === null ||
          parsed.data.sequence >= this.latestSnapshot.sequence)
      ) {
        this.latestSnapshot = parsed.data;
      }
    });
  }

  get snapshot(): PlayerSnapshot {
    if (!this.latestSnapshot) throw new Error('Host player has no snapshot');
    return this.latestSnapshot;
  }

  async connect(): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const connected = () => {
        cleanup();
        resolve();
      };
      const failed = (error: Error) => {
        cleanup();
        reject(error);
      };
      const cleanup = () => {
        this.socket.off('connect', connected);
        this.socket.off('connect_error', failed);
      };
      this.socket.on('connect', connected);
      this.socket.on('connect_error', failed);
      this.socket.connect();
    });
    await this.waitFor(() => true);
  }

  async waitFor(
    predicate: (snapshot: PlayerSnapshot) => boolean,
    timeoutMs = 10_000,
  ): Promise<PlayerSnapshot> {
    if (this.latestSnapshot && predicate(this.latestSnapshot)) {
      return this.latestSnapshot;
    }
    return new Promise<PlayerSnapshot>((resolve, reject) => {
      const listener = (raw: unknown) => {
        const parsed = PlayerSnapshotSchema.safeParse(raw);
        if (!parsed.success || !predicate(parsed.data)) return;
        cleanup();
        resolve(parsed.data);
      };
      const cleanup = () => {
        clearTimeout(timeout);
        this.socket.off('state:snapshot', listener);
      };
      const timeout = setTimeout(() => {
        cleanup();
        reject(
          new Error(
            `Timed out waiting for Host snapshot; latest=${JSON.stringify(
              this.latestSnapshot,
            )}`,
          ),
        );
      }, timeoutMs);
      this.socket.on('state:snapshot', listener);
    });
  }

  async submit(intent: Record<string, unknown>): Promise<CommandResponse> {
    const before = this.snapshot;
    const command = {
      protocolVersion: '3',
      commandId: randomUUID(),
      roomId: this.identity.roomId,
      playerId: this.identity.playerId,
      expectedVersion: before.stateVersion,
      ...intent,
    };
    const response = await new Promise<CommandResponse>((resolve, reject) => {
      this.socket
        .timeout(5_000)
        .emit(
          'command:submit',
          command,
          (error: Error | null, rawResponse: unknown) => {
            if (error) {
              reject(error);
              return;
            }
            const parsed = CommandResponseSchema.safeParse(rawResponse);
            if (!parsed.success) {
              reject(new Error('Host returned an invalid command response'));
              return;
            }
            resolve(parsed.data);
          },
        );
    });
    if (response.status !== 'accepted') {
      throw new Error(`Host command was ${response.status}`);
    }
    await this.waitFor(
      (snapshot) => snapshot.stateVersion >= response.stateVersion,
    );
    return response;
  }

  disconnect(): void {
    this.socket.removeAllListeners();
    this.socket.disconnect();
  }
}

class DeterministicMcpAgent {
  private readonly stderrChunks: string[] = [];

  private constructor(private readonly client: Client) {}

  static async start(): Promise<DeterministicMcpAgent> {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [mcpEntry],
      cwd: repositoryRoot,
      stderr: 'pipe',
    });
    const client = new Client(
      { name: 'closed-loop-poker-agent', version: '1.0.0' },
      { capabilities: {} },
    );
    const agent = new DeterministicMcpAgent(client);
    transport.stderr?.on('data', (chunk: Buffer | string) => {
      agent.stderrChunks.push(String(chunk));
    });
    await client.connect(transport);
    return agent;
  }

  async connectNew(
    hostUrl: string,
    recoveryFile: string,
  ): Promise<z.infer<typeof ConnectResultSchema>> {
    const connected = ConnectResultSchema.parse(
      await this.call('poker_connect', {
        hostUrl,
        nickname: 'MCP Agent',
      }),
    );
    await writeFile(
      recoveryFile,
      `${JSON.stringify(connected.recoveryToken)}\n`,
      'utf8',
    );
    return connected;
  }

  async resume(
    hostUrl: string,
    recoveryFile: string,
  ): Promise<z.infer<typeof ConnectResultSchema>> {
    const token = RecoveryTokenSchema.parse(
      JSON.parse(await readFile(recoveryFile, 'utf8')),
    );
    return ConnectResultSchema.parse(
      await this.call('poker_connect', {
        hostUrl,
        resumeToken: token,
      }),
    );
  }

  async observe(): Promise<z.infer<typeof ObserveResultSchema>> {
    return ObserveResultSchema.parse(await this.call('poker_observe'));
  }

  async waitTurn(): Promise<z.infer<typeof WaitResultSchema>> {
    return WaitResultSchema.parse(
      await this.call('poker_wait_turn', { timeoutMs: 2_000 }),
    );
  }

  async lobbyReady(): Promise<z.infer<typeof SubmitResultSchema>> {
    return SubmitResultSchema.parse(await this.call('poker_lobby_ready'));
  }

  async handReady(): Promise<z.infer<typeof SubmitResultSchema>> {
    return SubmitResultSchema.parse(
      await this.call('poker_submit_hand_ready', { choice: 'ready' }),
    );
  }

  async act(
    action: 'fold' | 'check' | 'call' | 'all-in',
  ): Promise<z.infer<typeof SubmitResultSchema>> {
    return SubmitResultSchema.parse(
      await this.call('poker_submit_action', { action }),
    );
  }

  async close(): Promise<void> {
    await this.client.close();
  }

  diagnostics(): string {
    return this.stderrChunks.join('');
  }

  private async call(
    name: string,
    arguments_: Record<string, unknown> = {},
  ): Promise<unknown> {
    try {
      const result = (await this.client.callTool(
        { name, arguments: arguments_ },
        CallToolResultSchema,
      )) as { readonly content: unknown[] };
      const first = result.content[0];
      if (
        typeof first !== 'object' ||
        first === null ||
        !('type' in first) ||
        first.type !== 'text' ||
        !('text' in first) ||
        typeof first.text !== 'string'
      ) {
        throw new Error(`MCP tool ${name} returned no text result`);
      }
      return JSON.parse(first.text) as unknown;
    } catch (error) {
      throw new Error(`MCP tool ${name} failed; stderr=${this.diagnostics()}`, {
        cause: error,
      });
    }
  }
}

function chooseAction(
  legal: LegalActions,
): 'fold' | 'check' | 'call' | 'all-in' {
  if (legal.canCheck) return 'check';
  if (legal.callAmount !== null) return 'call';
  if (legal.canAllIn) return 'all-in';
  if (legal.canFold) return 'fold';
  throw new Error(`No supported legal action: ${JSON.stringify(legal)}`);
}

function hostIntent(
  action: ReturnType<typeof chooseAction>,
): Record<string, unknown> {
  switch (action) {
    case 'fold':
      return { type: 'game.fold' };
    case 'check':
      return { type: 'game.check' };
    case 'call':
      return { type: 'game.call' };
    case 'all-in':
      return { type: 'game.all-in' };
  }
}

async function finishCurrentHand(
  host: HostPlayerClient,
  agent: DeterministicMcpAgent,
  agentPlayerId: string,
): Promise<{ completedHands: number; streets: string[] }> {
  const streets = new Set<string>();
  while (true) {
    const snapshot = await host.waitFor(
      (candidate) =>
        candidate.room.phase === 'hand-ready' ||
        (candidate.room.phase === 'playing' &&
          candidate.game?.currentActorId !== null),
    );
    if (snapshot.room.phase === 'hand-ready') {
      return {
        completedHands: snapshot.room.completedHands,
        streets: [...streets],
      };
    }
    if (snapshot.game?.street) streets.add(snapshot.game.street);

    const actorId = snapshot.game?.currentActorId;
    if (actorId === host.identity.playerId) {
      const legal = snapshot.game?.legalActions;
      if (!legal) throw new Error('Host turn has no legal actions');
      await host.submit(hostIntent(chooseAction(legal)));
      continue;
    }

    if (actorId !== agentPlayerId) {
      throw new Error(`Unexpected current actor: ${actorId ?? 'none'}`);
    }

    const beforeVersion = snapshot.stateVersion;
    const wait = await agent.waitTurn();
    expect(wait).toMatchObject({ reason: 'your-turn', error: null });
    const observed = await agent.observe();
    expect(observed).toMatchObject({
      playerId: agentPlayerId,
      isMyTurn: true,
      currentActorId: agentPlayerId,
    });
    if (!observed.legalActions) {
      throw new Error('Agent turn has no legal actions');
    }
    const submitted = await agent.act(chooseAction(observed.legalActions));
    expect(submitted).toMatchObject({ accepted: true, status: 'accepted' });
    await host.waitFor((candidate) => candidate.stateVersion > beforeVersion);
  }
}

async function startNextHand(
  host: HostPlayerClient,
  agent: DeterministicMcpAgent,
): Promise<void> {
  const readySnapshot = await host.waitFor(
    (snapshot) => snapshot.room.phase === 'hand-ready',
  );
  expect(await agent.observe()).toMatchObject({
    phase: 'hand-ready',
    completedHands: readySnapshot.room.completedHands,
  });
  const agentSubmitted = await agent.handReady();
  expect(agentSubmitted).toMatchObject({ accepted: true, status: 'accepted' });
  if (
    agentSubmitted.stateVersion === null ||
    agentSubmitted.stateVersion === undefined
  ) {
    throw new Error('Agent hand-ready response has no stateVersion');
  }
  const agentReadyVersion = agentSubmitted.stateVersion;
  const afterAgentReady = await host.waitFor(
    (snapshot) => snapshot.stateVersion >= agentReadyVersion,
  );
  const beforeVersion = afterAgentReady.stateVersion;
  if (
    afterAgentReady.room.phase === 'hand-ready' &&
    afterAgentReady.handReady?.ownChoice !== 'ready'
  ) {
    await host.submit({
      type: 'hand-ready.set-choice',
      choice: 'ready',
    });
  }
  await host.waitFor(
    (snapshot) =>
      snapshot.stateVersion >= beforeVersion &&
      snapshot.room.phase === 'playing',
  );
}

describe('MCP closed-loop match', () => {
  it('plays three persisted hands after restarting and recovering both endpoints', async () => {
    const temporaryDirectory = await mkdtemp(
      join(tmpdir(), 'texas-holdem-mcp-loop-'),
    );
    const recoveryFile = join(temporaryDirectory, 'agent-recovery.json');
    let startedHost: StartedHost | null = null;
    let hostClient: HostPlayerClient | null = null;
    let agent: DeterministicMcpAgent | null = null;

    try {
      startedHost = await startHost(temporaryDirectory);
      const hostIdentity = await createRoom(startedHost.hostUrl);
      hostClient = new HostPlayerClient(startedHost.hostUrl, hostIdentity);
      await hostClient.connect();

      agent = await DeterministicMcpAgent.start();
      const firstConnection = await agent.connectNew(
        startedHost.hostUrl,
        recoveryFile,
      );
      const agentPlayerId = firstConnection.playerId;
      expect(firstConnection.roomId).toBe(hostIdentity.roomId);

      const lobbyWait = await agent.waitTurn();
      expect(lobbyWait).toMatchObject({ reason: 'lobby-ready', error: null });
      expect(await agent.lobbyReady()).toMatchObject({
        accepted: true,
        status: 'accepted',
      });
      await hostClient.waitFor((snapshot) =>
        snapshot.room.players.some(
          (player) =>
            player.playerId === agentPlayerId && player.lobbyReady === true,
        ),
      );

      await hostClient.submit({
        type: 'room.start-first-hand',
        handId: randomUUID(),
      });
      await hostClient.waitFor((snapshot) => snapshot.room.phase === 'playing');

      for (
        let expectedCompletedHands = 1;
        expectedCompletedHands <= TARGET_COMPLETED_HANDS;
        expectedCompletedHands += 1
      ) {
        const handResult = await finishCurrentHand(
          hostClient,
          agent,
          agentPlayerId,
        );
        expect(handResult.completedHands).toBe(expectedCompletedHands);
        expect(handResult.streets).toEqual(
          expect.arrayContaining(['preflop', 'flop', 'turn', 'river']),
        );

        if (expectedCompletedHands === 1) {
          await agent.close();
          agent = null;
          hostClient.disconnect();
          hostClient = null;
          await stopProcess(startedHost.process);

          startedHost = await startHost(temporaryDirectory);
          const recoveredHostIdentity = await recoverRoom(
            startedHost,
            hostIdentity.roomId,
          );
          expect(recoveredHostIdentity).toMatchObject({
            roomId: hostIdentity.roomId,
            playerId: hostIdentity.playerId,
          });
          hostClient = new HostPlayerClient(
            startedHost.hostUrl,
            recoveredHostIdentity,
          );
          await hostClient.connect();

          agent = await DeterministicMcpAgent.start();
          const resumed = await agent.resume(startedHost.hostUrl, recoveryFile);
          expect(resumed).toMatchObject({
            roomId: hostIdentity.roomId,
            playerId: agentPlayerId,
            phase: 'hand-ready',
          });
          expect(await agent.observe()).toMatchObject({
            roomId: hostIdentity.roomId,
            playerId: agentPlayerId,
            completedHands: 1,
            phase: 'hand-ready',
          });
          expect(hostClient.snapshot.room.completedHands).toBe(1);
          expect(hostClient.snapshot.room.phase).toBe('hand-ready');
        }

        if (expectedCompletedHands < TARGET_COMPLETED_HANDS) {
          await startNextHand(hostClient, agent);
        }
      }

      const agentFinal = await agent.observe();
      const hostFinal = hostClient.snapshot;
      expect(agentFinal).toMatchObject({
        roomId: hostIdentity.roomId,
        playerId: agentPlayerId,
        completedHands: TARGET_COMPLETED_HANDS,
        phase: 'hand-ready',
      });
      expect(hostFinal.room.completedHands).toBe(TARGET_COMPLETED_HANDS);
      expect(hostFinal.room.players.map((player) => player.playerId)).toEqual(
        expect.arrayContaining([hostIdentity.playerId, agentPlayerId]),
      );

      await agent.close();
      agent = null;
      hostClient.disconnect();
      hostClient = null;
      await stopProcess(startedHost.process);

      const database = new DatabaseSync(startedHost.databasePath, {
        readOnly: true,
      });
      try {
        const room = database
          .prepare(
            'SELECT phase, state_version, normal_closed FROM rooms WHERE room_id = ?',
          )
          .get(hostIdentity.roomId) as unknown as RoomRow;
        const players = database
          .prepare(
            'SELECT player_id, nickname, chips FROM players WHERE room_id = ? ORDER BY seat_index',
          )
          .all(hostIdentity.roomId) as unknown as PlayerRow[];
        const summaries = database
          .prepare(
            'SELECT COUNT(*) AS count FROM hand_summaries WHERE room_id = ?',
          )
          .get(hostIdentity.roomId) as unknown as CountRow;
        const snapshots = database
          .prepare(
            'SELECT COUNT(*) AS count FROM snapshots WHERE room_id = ? AND valid = 1',
          )
          .get(hostIdentity.roomId) as unknown as CountRow;
        const identities = database
          .prepare(
            'SELECT COUNT(*) AS count FROM reconnect_identities WHERE room_id = ?',
          )
          .get(hostIdentity.roomId) as unknown as CountRow;

        expect(room).toMatchObject({
          phase: 'hand-ready',
          normal_closed: 0,
        });
        expect(room.state_version).toBeGreaterThan(0);
        expect(players).toEqual([
          expect.objectContaining({
            player_id: hostIdentity.playerId,
            nickname: '房主测试端',
          }),
          expect.objectContaining({
            player_id: agentPlayerId,
            nickname: 'MCP Agent',
          }),
        ]);
        expect(players.reduce((sum, player) => sum + player.chips, 0)).toBe(
          2_000,
        );
        expect(summaries.count).toBe(TARGET_COMPLETED_HANDS);
        expect(snapshots.count).toBeGreaterThan(TARGET_COMPLETED_HANDS);
        expect(identities.count).toBe(2);
      } finally {
        database.close();
      }
    } catch (error) {
      const diagnostics = [
        startedHost?.output() ?? '',
        agent?.diagnostics() ?? '',
      ]
        .filter(Boolean)
        .join('\n');
      throw new Error(`Closed-loop match failed:\n${diagnostics}`, {
        cause: error,
      });
    } finally {
      await agent?.close().catch(() => undefined);
      hostClient?.disconnect();
      if (startedHost) await stopProcess(startedHost.process);
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  });
});
