import { z } from 'zod';

import { IdSchema } from './primitives.js';
import { RoomSettingsSchema } from './room-commands.js';
import { ProtocolVersionSchema } from './primitives.js';

export const CreateRoomSessionRequestSchema = z.object({
  hostNickname: z.string().trim().min(1).max(40),
  settings: RoomSettingsSchema,
});

export const JoinRoomSessionRequestSchema = z.object({
  nickname: z.string().trim().min(1).max(40),
});

export const ResumeRoomSessionRequestSchema = z.object({
  playerId: IdSchema,
  token: z.string().min(16),
});

export const RoomSessionResponseSchema = z.object({
  protocolVersion: ProtocolVersionSchema,
  roomId: IdSchema,
  playerId: IdSchema,
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
export type RoomSessionResponse = z.infer<typeof RoomSessionResponseSchema>;
