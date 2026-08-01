import {
  HealthResponseSchema,
  PROTOCOL_VERSION,
  SystemHelloRequestSchema,
  SystemHelloResponseSchema,
  type HealthResponse,
  type SystemHelloResponse,
} from '@texas-holdem/protocol';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Server as SocketIOServer } from 'socket.io';

export const HOST_SERVER_VERSION = '0.0.0';

export interface CreateHostServerOptions {
  staticDirectory?: string;
}

export interface HostServer {
  app: FastifyInstance;
  io: SocketIOServer;
  close(): Promise<void>;
}

export async function createHostServer(
  options: CreateHostServerOptions = {},
): Promise<HostServer> {
  const app = Fastify({ logger: false });
  const io = new SocketIOServer(app.server, {
    serveClient: false,
  });

  const health: HealthResponse = HealthResponseSchema.parse({
    status: 'ok',
    protocolVersion: PROTOCOL_VERSION,
    serverVersion: HOST_SERVER_VERSION,
  });

  app.get('/health', async () => health);
  app.get('/version', async () => ({
    protocolVersion: PROTOCOL_VERSION,
    serverVersion: HOST_SERVER_VERSION,
  }));

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
  });

  await app.ready();

  return {
    app,
    io,
    async close() {
      await new Promise<void>((resolve) => {
        io.close(() => resolve());
      });
      await app.close();
    },
  };
}
