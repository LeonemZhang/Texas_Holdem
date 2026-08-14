import { z } from 'zod';

import { IdSchema } from './primitives.js';
import { RoomSettingsSchema } from './room-commands.js';
import { ProtocolVersionSchema } from './primitives.js';

export const CreateRoomSessionRequestSchema = z.object({
  hostNickname: z.string().trim().min(1).max(40),
  settings: RoomSettingsSchema,
  hostParticipation: z.enum(['player', 'service-only']).optional(),
});

export const JoinRoomSessionRequestSchema = z.object({
  nickname: z.string().trim().min(1).max(40),
});

export const ResumeRoomSessionRequestSchema = z.object({
  playerId: IdSchema,
  token: z.string().min(16),
  nickname: z.string().trim().min(1).max(40).optional(),
  sessionType: z.enum(['player', 'host']).optional(),
  hostId: IdSchema.optional(),
});

export const RoomNicknameProbeResponseSchema = z.object({
  protocolVersion: ProtocolVersionSchema,
  roomId: IdSchema,
  /** The requested nickname when available, otherwise a server suggestion. */
  nickname: z.string().trim().min(1).max(40),
});

export const RoomSessionResponseSchema = z.object({
  protocolVersion: ProtocolVersionSchema,
  roomId: IdSchema,
  playerId: IdSchema,
  /** Explicit role discriminator; omitted by legacy Player clients. */
  sessionType: z.enum(['player', 'host']).optional(),
  /** Present for both roles; in host sessions this is never a Player identity. */
  hostId: IdSchema.optional(),
  token: z.string().min(16),
  joinUrl: z.string().url(),
  socketPath: z.string().startsWith('/'),
});

export type CreateRoomSessionRequest = z.infer<
  typeof CreateRoomSessionRequestSchema
>;
export type JoinRoomSessionRequest = z.infer<
  typeof JoinRoomSessionRequestSchema
>;
export type ResumeRoomSessionRequest = z.infer<
  typeof ResumeRoomSessionRequestSchema
>;
export type RoomNicknameProbeResponse = z.infer<
  typeof RoomNicknameProbeResponseSchema
>;
export type RoomSessionResponse = z.infer<typeof RoomSessionResponseSchema>;
