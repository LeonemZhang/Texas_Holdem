import { z } from 'zod';

import {
  ErrorEnvelopeSchema,
  IdSchema,
  ProtocolVersionSchema,
  SequenceSchema,
  StateVersionSchema,
} from './primitives.js';
import { PROTOCOL_VERSION } from './system.js';

const ResponseBase = {
  protocolVersion: ProtocolVersionSchema,
  commandId: IdSchema,
} as const;
const error = ErrorEnvelopeSchema.shape.error;

export const CommandAcceptedResponseSchema = z.object({
  ...ResponseBase,
  status: z.literal('accepted'),
  stateVersion: StateVersionSchema,
  sequence: SequenceSchema,
});
export const CommandRejectedResponseSchema = z.object({
  ...ResponseBase,
  status: z.literal('rejected'),
  error,
});
export const CommandConflictResponseSchema = z.object({
  ...ResponseBase,
  status: z.literal('conflict'),
  expectedVersion: StateVersionSchema,
  currentVersion: StateVersionSchema,
  error,
});
export const CommandUnauthorizedResponseSchema = z.object({
  ...ResponseBase,
  status: z.literal('unauthorized'),
  error,
});
export const CommandResyncRequiredResponseSchema = z.object({
  ...ResponseBase,
  status: z.literal('resync-required'),
  currentVersion: StateVersionSchema,
  latestSequence: SequenceSchema,
  error,
});

export const CommandResponseSchema = z.discriminatedUnion('status', [
  CommandAcceptedResponseSchema,
  CommandRejectedResponseSchema,
  CommandConflictResponseSchema,
  CommandUnauthorizedResponseSchema,
  CommandResyncRequiredResponseSchema,
]);

export const IncompatibleVersionResponseSchema = z.object({
  status: z.literal('incompatible-version'),
  supportedProtocolVersion: z.literal(PROTOCOL_VERSION),
  receivedProtocolVersion: z.string().min(1),
  error,
});

export type CommandResponse = z.infer<typeof CommandResponseSchema>;
export type IncompatibleVersionResponse = z.infer<
  typeof IncompatibleVersionResponseSchema
>;
