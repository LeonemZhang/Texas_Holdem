import { z } from 'zod';

import {
  CommandIdentitySchema,
  IdSchema,
  PositiveAmountSchema,
} from './primitives.js';

const identity = CommandIdentitySchema.shape;

export const SetHandReadyChoiceCommandSchema = z.object({
  ...identity,
  type: z.literal('hand-ready.set-choice'),
  choice: z.enum(['ready', 'sitting-out']),
});

const ChipRequestFields = {
  ...identity,
  requestId: IdSchema,
  amount: PositiveAmountSchema,
  note: z.string().trim().max(500).optional(),
} as const;

export const CreateTargetedChipRequestCommandSchema = z
  .object({
    ...ChipRequestFields,
    type: z.literal('chips.request'),
    audience: z.literal('targeted'),
    targetPlayerId: IdSchema,
  })
  .strict();

export const CreateTableChipRequestCommandSchema = z
  .object({
    ...ChipRequestFields,
    type: z.literal('chips.request'),
    audience: z.literal('table'),
  })
  .strict();

export const CreateChipRequestCommandSchema = z.discriminatedUnion('audience', [
  CreateTargetedChipRequestCommandSchema,
  CreateTableChipRequestCommandSchema,
]);

const requestDecision = <T extends string>(type: T) =>
  z.object({ ...identity, type: z.literal(type), requestId: IdSchema });

export const RevokeChipRequestCommandSchema = requestDecision('chips.revoke');
export const RejectChipRequestCommandSchema = requestDecision('chips.reject');
export const ApproveChipRequestCommandSchema = z.object({
  ...identity,
  type: z.literal('chips.approve'),
  requestId: IdSchema,
  transferId: IdSchema,
});
export const GiveChipsCommandSchema = z.object({
  ...identity,
  type: z.literal('chips.give'),
  transferId: IdSchema,
  receiverPlayerId: IdSchema,
  amount: PositiveAmountSchema,
});

export const HandReadyCommandSchema = z.union([
  SetHandReadyChoiceCommandSchema,
  CreateChipRequestCommandSchema,
  RevokeChipRequestCommandSchema,
  RejectChipRequestCommandSchema,
  ApproveChipRequestCommandSchema,
  GiveChipsCommandSchema,
]);

export type SetHandReadyChoiceCommand = z.infer<
  typeof SetHandReadyChoiceCommandSchema
>;
export type CreateChipRequestCommand = z.infer<
  typeof CreateChipRequestCommandSchema
>;
export type HandReadyCommand = z.infer<typeof HandReadyCommandSchema>;
