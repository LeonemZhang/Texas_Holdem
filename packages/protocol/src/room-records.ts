import { z } from 'zod';

import { IdSchema } from './primitives.js';
import { RoomSettingsSchema } from './room-commands.js';
import { PROTOCOL_VERSION } from './system.js';

export const RoomRecordStatusSchema = z.enum([
  'running',
  'recoverable',
  'closed',
  'archived',
]);

export const RoomRecordNetworkSchema = z.object({
  name: z.string().trim().min(1).max(256),
  address: z.ipv4(),
});

export const RoomRecordSummarySchema = z.object({
  roomId: IdSchema,
  roomName: z.string().trim().min(1).max(128),
  hostNickname: z.string().trim().min(1).max(128),
  status: RoomRecordStatusSchema,
  createdAt: z.string().datetime(),
  lastActiveAt: z.string().datetime(),
  completedHands: z.number().int().nonnegative().safe(),
  playerCount: z.number().int().min(1).max(10).safe(),
  network: RoomRecordNetworkSchema.nullable(),
});

const ManagementRequestSchema = z.object({
  protocolVersion: z.literal(PROTOCOL_VERSION),
  requestId: IdSchema,
});

export const ListRoomRecordsRequestSchema = ManagementRequestSchema.extend({
  type: z.literal('room-record.list'),
  includeArchived: z.boolean(),
});

export const CreateRoomRecordRequestSchema = ManagementRequestSchema.extend({
  type: z.literal('room-record.create'),
  hostNickname: z.string().trim().min(1).max(128),
  settings: RoomSettingsSchema,
});

export const RecoverRoomRecordRequestSchema = ManagementRequestSchema.extend({
  type: z.literal('room-record.recover'),
  roomId: IdSchema,
});

export const CloseRunningRoomRecordRequestSchema =
  ManagementRequestSchema.extend({
    type: z.literal('room-record.close-running'),
    roomId: IdSchema,
  });

export const ArchiveRoomRecordRequestSchema = ManagementRequestSchema.extend({
  type: z.literal('room-record.archive'),
  roomId: IdSchema,
});

export const RestoreRoomRecordRequestSchema = ManagementRequestSchema.extend({
  type: z.literal('room-record.restore'),
  roomId: IdSchema,
});

export const DeleteRoomRecordRequestSchema = ManagementRequestSchema.extend({
  type: z.literal('room-record.delete'),
  roomId: IdSchema,
});

export const GetRoomRecordRequestSchema = ManagementRequestSchema.extend({
  type: z.literal('room-record.get'),
  roomId: IdSchema,
});

export const RoomRecordManagementRequestSchema = z.discriminatedUnion('type', [
  ListRoomRecordsRequestSchema,
  CreateRoomRecordRequestSchema,
  RecoverRoomRecordRequestSchema,
  CloseRunningRoomRecordRequestSchema,
  ArchiveRoomRecordRequestSchema,
  RestoreRoomRecordRequestSchema,
  DeleteRoomRecordRequestSchema,
  GetRoomRecordRequestSchema,
]);

export const RoomRecordManagementResponseSchema = z.discriminatedUnion(
  'status',
  [
    z.object({
      protocolVersion: z.literal(PROTOCOL_VERSION),
      requestId: IdSchema,
      status: z.literal('accepted'),
      result: z.unknown(),
    }),
    z.object({
      protocolVersion: z.literal(PROTOCOL_VERSION),
      requestId: IdSchema,
      status: z.literal('rejected'),
      error: z.object({
        code: z.enum(['NOT_FOUND', 'CONFLICT', 'INVALID_REQUEST']),
        message: z.string().trim().min(1),
      }),
    }),
  ],
);

export type RoomRecordStatus = z.infer<typeof RoomRecordStatusSchema>;
export type RoomRecordNetwork = z.infer<typeof RoomRecordNetworkSchema>;
export type RoomRecordSummary = z.infer<typeof RoomRecordSummarySchema>;
export type ListRoomRecordsRequest = z.infer<
  typeof ListRoomRecordsRequestSchema
>;
export type CreateRoomRecordRequest = z.infer<
  typeof CreateRoomRecordRequestSchema
>;
export type RecoverRoomRecordRequest = z.infer<
  typeof RecoverRoomRecordRequestSchema
>;
export type CloseRunningRoomRecordRequest = z.infer<
  typeof CloseRunningRoomRecordRequestSchema
>;
export type ArchiveRoomRecordRequest = z.infer<
  typeof ArchiveRoomRecordRequestSchema
>;
export type RestoreRoomRecordRequest = z.infer<
  typeof RestoreRoomRecordRequestSchema
>;
export type DeleteRoomRecordRequest = z.infer<
  typeof DeleteRoomRecordRequestSchema
>;
export type GetRoomRecordRequest = z.infer<typeof GetRoomRecordRequestSchema>;
export type RoomRecordManagementRequest = z.infer<
  typeof RoomRecordManagementRequestSchema
>;
export type RoomRecordManagementResponse = z.infer<
  typeof RoomRecordManagementResponseSchema
>;
