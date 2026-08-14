import { z } from 'zod';

import { PROTOCOL_VERSION } from './system.js';

export const ProtocolVersionSchema = z.literal(PROTOCOL_VERSION);
export const IdSchema = z.string().trim().min(1).max(128);
export const AmountSchema = z.number().int().nonnegative().safe();
export const PositiveAmountSchema = z.number().int().positive().safe();
export const SequenceSchema = z.number().int().nonnegative().safe();
export const StateVersionSchema = z.number().int().nonnegative().safe();
export const TimestampMsSchema = z.number().int().nonnegative().safe();

export const CommandIdentitySchema = z.object({
  protocolVersion: ProtocolVersionSchema,
  commandId: IdSchema,
  roomId: IdSchema,
  playerId: IdSchema,
  expectedVersion: StateVersionSchema,
  /** Optional for wire compatibility; host commands use the independent host actor. */
  actorType: z.enum(['player', 'host']).optional(),
});

export const ProtocolErrorCodeSchema = z.enum([
  'INVALID_MESSAGE',
  'INCOMPATIBLE_VERSION',
  'NOT_FOUND',
  'CONFLICT',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'RESYNC_REQUIRED',
  'INTERNAL_ERROR',
]);

export const ErrorEnvelopeSchema = z.object({
  error: z.object({
    code: ProtocolErrorCodeSchema,
    message: z.string().trim().min(1),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type ProtocolVersion = z.infer<typeof ProtocolVersionSchema>;
export type ProtocolId = z.infer<typeof IdSchema>;
export type Amount = z.infer<typeof AmountSchema>;
export type Sequence = z.infer<typeof SequenceSchema>;
export type StateVersion = z.infer<typeof StateVersionSchema>;
export type TimestampMs = z.infer<typeof TimestampMsSchema>;
export type CommandIdentity = z.infer<typeof CommandIdentitySchema>;
export type ProtocolErrorCode = z.infer<typeof ProtocolErrorCodeSchema>;
export type ErrorEnvelope = z.infer<typeof ErrorEnvelopeSchema>;
