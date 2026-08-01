import { z } from 'zod';

import { DomainEventSchema } from './domain-events.js';
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

export type ResyncRequest = z.infer<typeof ResyncRequestSchema>;
export type ResyncResponse = z.infer<typeof ResyncResponseSchema>;
