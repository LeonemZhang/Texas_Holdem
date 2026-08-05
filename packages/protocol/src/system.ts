import { z } from 'zod';

export const PROTOCOL_VERSION = '3' as const;

export const SystemHelloRequestSchema = z.object({
  protocolVersion: z.string().min(1),
});

export const SocketAuthenticationSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  roomId: z.string().trim().min(1).max(128),
  playerId: z.string().trim().min(1).max(128),
  token: z.string().min(16).max(512),
});

export const SystemHelloResponseSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  serverVersion: z.string().min(1),
  serverTime: z.string().datetime(),
});

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  protocolVersion: z.literal(PROTOCOL_VERSION),
  serverVersion: z.string().min(1),
  connection: z.object({
    host: z.string().trim().min(1),
    port: z.number().int().min(1).max(65_535),
    joinUrl: z.url(),
    socketPath: z.string().startsWith('/'),
  }),
});

export const JoinBootstrapResponseSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  serverVersion: z.string().min(1),
  serverTime: z.string().datetime(),
  connection: HealthResponseSchema.shape.connection,
});

export type SystemHelloRequest = z.infer<typeof SystemHelloRequestSchema>;
export type SocketAuthentication = z.infer<typeof SocketAuthenticationSchema>;
export type SystemHelloResponse = z.infer<typeof SystemHelloResponseSchema>;
export type HealthResponse = z.infer<typeof HealthResponseSchema>;
export type JoinBootstrapResponse = z.infer<typeof JoinBootstrapResponseSchema>;
