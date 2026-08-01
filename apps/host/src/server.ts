import {
  HealthResponseSchema,
  CreateRoomSessionRequestSchema,
  JoinBootstrapResponseSchema,
  JoinRoomSessionRequestSchema,
  PROTOCOL_VERSION,
  ResyncRequestSchema,
  SocketAuthenticationSchema,
  SystemHelloRequestSchema,
  SystemHelloResponseSchema,
  type HealthResponse,
  type JoinBootstrapResponse,
  type PlayerSnapshot,
  type RoomSessionResponse,
  type SystemHelloResponse,
} from '@texas-holdem/protocol';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Server as SocketIOServer } from 'socket.io';

import type { CommandResponse } from '@texas-holdem/protocol';

import type { CommandDispatcher } from './application/command-dispatcher.js';
import type { RoomSessionBootstrapService } from './application/game-runtime.js';
import type { ReconnectSynchronizer } from './application/reconnect-synchronizer.js';
import type {
  SessionAuthenticator,
  SessionIdentity,
} from './application/session-authenticator.js';
import {
  privatePlayerChannel,
  publicRoomChannel,
  SocketPublisher,
} from './application/socket-publisher.js';

export const HOST_SERVER_VERSION = '0.0.0';

export interface CreateHostServerOptions {
  staticDirectory?: string;
  advertisedHost?: string;
  port?: number;
  commandDispatcher?: Pick<CommandDispatcher, 'dispatch'>;
  sessionAuthenticator?: SessionAuthenticator;
  reconnectSynchronizer?: ReconnectSynchronizer;
  roomSessionService?: RoomSessionBootstrapService;
  snapshotProvider?: (
    roomId: string,
    playerId: string,
  ) => PlayerSnapshot | null;
  roomSnapshotsProvider?: (roomId: string) => readonly PlayerSnapshot[];
}

export interface HostServer {
  app: FastifyInstance;
  io: SocketIOServer;
  publisher: SocketPublisher;
  close(): Promise<void>;
}

export async function createHostServer(
  options: CreateHostServerOptions = {},
): Promise<HostServer> {
  const app = Fastify({ logger: false });
  const io = new SocketIOServer(app.server, {
    serveClient: false,
    cors: { origin: true },
  });
  const publisher = new SocketPublisher(io);
  await app.register(fastifyCors, { origin: true });

  const connection = () => {
    const address = app.server.address();
    const actualPort =
      typeof address === 'object' && address ? address.port : options.port;
    const port = actualPort ?? 32_100;
    const host = options.advertisedHost?.trim() || '127.0.0.1';
    const urlHost = host.includes(':') ? `[${host}]` : host;
    return {
      host,
      port,
      joinUrl: `http://${urlHost}:${port}`,
      socketPath: '/socket.io',
    };
  };

  app.get('/health', async (): Promise<HealthResponse> =>
    HealthResponseSchema.parse({
      status: 'ok',
      protocolVersion: PROTOCOL_VERSION,
      serverVersion: HOST_SERVER_VERSION,
      connection: connection(),
    }),
  );
  app.get('/api/bootstrap', async (): Promise<JoinBootstrapResponse> =>
    JoinBootstrapResponseSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      serverVersion: HOST_SERVER_VERSION,
      serverTime: new Date().toISOString(),
      connection: connection(),
    }),
  );
  app.get('/version', async () => ({
    protocolVersion: PROTOCOL_VERSION,
    serverVersion: HOST_SERVER_VERSION,
  }));

  if (options.roomSessionService) {
    app.get('/api/rooms/current', async (_request, reply) => {
      const roomId = options.roomSessionService!.currentRoomId();
      return roomId
        ? { protocolVersion: PROTOCOL_VERSION, roomId }
        : reply.code(404).send({
            error: { code: 'NOT_FOUND', message: '房主尚未创建房间' },
          });
    });
    app.post(
      '/api/rooms',
      async (request, reply): Promise<RoomSessionResponse | object> => {
        const parsed = CreateRoomSessionRequestSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({
            error: { code: 'INVALID_MESSAGE', message: '房间设置无效' },
          });
        }
        try {
          return options.roomSessionService!.create(
            parsed.data,
            connection().joinUrl,
          );
        } catch (error) {
          return reply.code(409).send({
            error: {
              code: 'CONFLICT',
              message: error instanceof Error ? error.message : '创建房间失败',
            },
          });
        }
      },
    );
    app.post(
      '/api/rooms/:roomId/join',
      async (request, reply): Promise<RoomSessionResponse | object> => {
        const parsed = JoinRoomSessionRequestSchema.safeParse(request.body);
        const roomId = (request.params as { roomId?: unknown }).roomId;
        if (!parsed.success || typeof roomId !== 'string' || !roomId.trim()) {
          return reply.code(400).send({
            error: { code: 'INVALID_MESSAGE', message: '加入信息无效' },
          });
        }
        try {
          return options.roomSessionService!.join(
            roomId,
            parsed.data,
            connection().joinUrl,
          );
        } catch (error) {
          return reply.code(409).send({
            error: {
              code: 'CONFLICT',
              message: error instanceof Error ? error.message : '加入房间失败',
            },
          });
        }
      },
    );
  }

  if (
    options.staticDirectory &&
    existsSync(join(options.staticDirectory, 'index.html'))
  ) {
    await app.register(fastifyStatic, {
      root: options.staticDirectory,
    });
  } else {
    app.get('/', async () => ({
      message: 'Texas Hold’em host service is running',
      protocolVersion: PROTOCOL_VERSION,
    }));
  }
  io.on('connection', (socket) => {
    const parsedAuthentication = SocketAuthenticationSchema.safeParse(
      socket.handshake.auth,
    );
    const identity: SessionIdentity | null =
      parsedAuthentication.success && options.sessionAuthenticator
        ? options.sessionAuthenticator.authenticate(parsedAuthentication.data)
        : null;
    if (identity) {
      void socket.join([
        publicRoomChannel(identity.roomId),
        privatePlayerChannel(identity.roomId, identity.playerId),
      ]);
      const snapshot = options.snapshotProvider?.(
        identity.roomId,
        identity.playerId,
      );
      if (snapshot) socket.emit('state:snapshot', snapshot);
    }

    socket.on('system:hello', (rawRequest: unknown, acknowledge: unknown) => {
      const request = SystemHelloRequestSchema.safeParse(rawRequest);
      if (!request.success || typeof acknowledge !== 'function') {
        return;
      }

      const response: SystemHelloResponse = SystemHelloResponseSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        serverVersion: HOST_SERVER_VERSION,
        serverTime: new Date().toISOString(),
      });
      acknowledge(response);
    });

    socket.on('command:submit', (rawCommand: unknown, acknowledge: unknown) => {
      if (typeof acknowledge !== 'function') return;
      const commandId =
        typeof rawCommand === 'object' &&
        rawCommand !== null &&
        'commandId' in rawCommand &&
        typeof rawCommand.commandId === 'string' &&
        rawCommand.commandId.trim()
          ? rawCommand.commandId
          : 'unknown-command';
      const unauthorized = (): CommandResponse => ({
        protocolVersion: PROTOCOL_VERSION,
        commandId,
        status: 'unauthorized',
        error: {
          code: 'UNAUTHORIZED',
          message: 'Socket session is not authenticated for this identity',
        },
      });
      if (
        !identity ||
        !options.commandDispatcher ||
        typeof rawCommand !== 'object' ||
        rawCommand === null ||
        !('roomId' in rawCommand) ||
        !('playerId' in rawCommand) ||
        rawCommand.roomId !== identity.roomId ||
        rawCommand.playerId !== identity.playerId
      ) {
        acknowledge(unauthorized());
        return;
      }
      try {
        const response = options.commandDispatcher.dispatch(rawCommand);
        acknowledge(response);
        if (response.status === 'accepted') {
          for (const snapshot of options.roomSnapshotsProvider?.(
            identity.roomId,
          ) ?? []) {
            publisher.publishSnapshot(snapshot);
          }
        }
      } catch {
        acknowledge({
          protocolVersion: PROTOCOL_VERSION,
          commandId,
          status: 'rejected',
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Command handling failed',
          },
        } satisfies CommandResponse);
      }
    });

    socket.on('state:resync', (rawRequest: unknown, acknowledge: unknown) => {
      if (typeof acknowledge !== 'function') return;
      const request = ResyncRequestSchema.safeParse(rawRequest);
      if (!request.success || !identity || !options.reconnectSynchronizer) {
        acknowledge({
          protocolVersion: PROTOCOL_VERSION,
          status: 'failed',
          latestSequence: 0,
          error: {
            code: request.success ? 'UNAUTHORIZED' : 'INVALID_MESSAGE',
            message: request.success
              ? 'Socket session cannot resynchronize this identity'
              : 'Resynchronization request is invalid',
          },
        });
        return;
      }
      acknowledge(
        options.reconnectSynchronizer.synchronize(identity, request.data),
      );
    });
  });

  await app.ready();

  return {
    app,
    io,
    publisher,
    async close() {
      await new Promise<void>((resolve) => {
        io.close(() => resolve());
      });
      await app.close();
    },
  };
}
