import { z } from 'zod';

import { DomainEventSchema } from './domain-events.js';
import { HostManagementSnapshotSchema } from './host-snapshot.js';
import { PlayerSnapshotSchema } from './player-snapshot.js';
import {
  ErrorEnvelopeSchema,
  IdSchema,
  ProtocolVersionSchema,
  SequenceSchema,
} from './primitives.js';

export const ResyncRequestSchema = z.object({
  protocolVersion: ProtocolVersionSchema,
  roomId: IdSchema,
  playerId: IdSchema,
  offset: SequenceSchema,
  sessionType: z.enum(['player', 'host']).optional(),
  hostId: IdSchema.optional(),
});

const responseBase = {
  protocolVersion: ProtocolVersionSchema,
  latestSequence: SequenceSchema,
} as const;

export const ResyncEventsResponseSchema = z.object({
  ...responseBase,
  status: z.literal('events'),
  events: z.array(DomainEventSchema),
});

export const ResyncSnapshotResponseSchema = z.object({
  ...responseBase,
  status: z.literal('snapshot'),
  snapshot: PlayerSnapshotSchema,
});

export const ResyncHostSnapshotResponseSchema = z.object({
  ...responseBase,
  status: z.literal('snapshot'),
  snapshot: HostManagementSnapshotSchema,
});

export const ResyncFailedResponseSchema = z.object({
  ...responseBase,
  status: z.literal('failed'),
  error: ErrorEnvelopeSchema.shape.error,
});

export const ResyncResponseSchema = z.discriminatedUnion('status', [
  ResyncEventsResponseSchema,
  ResyncSnapshotResponseSchema,
  ResyncFailedResponseSchema,
]);

/** Host control sessions use a separate response type so old Player clients
 * continue to receive the original PlayerSnapshot-only contract. */
export const ResyncHostResponseSchema = z.discriminatedUnion('status', [
  ResyncEventsResponseSchema,
  ResyncHostSnapshotResponseSchema,
  ResyncFailedResponseSchema,
]);

export type ResyncRequest = z.infer<typeof ResyncRequestSchema>;
export type ResyncResponse = z.infer<typeof ResyncResponseSchema>;
export type ResyncHostResponse = z.infer<typeof ResyncHostResponseSchema>;
