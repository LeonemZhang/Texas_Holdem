import { z } from 'zod';

import { CommandIdentitySchema, PositiveAmountSchema } from './primitives.js';

const identity = CommandIdentitySchema.shape;

export const FoldCommandSchema = z.object({
  ...identity,
  type: z.literal('game.fold'),
});
export const CheckCommandSchema = z.object({
  ...identity,
  type: z.literal('game.check'),
});
export const CallCommandSchema = z.object({
  ...identity,
  type: z.literal('game.call'),
});
export const RaiseToCommandSchema = z.object({
  ...identity,
  type: z.literal('game.raise-to'),
  amount: PositiveAmountSchema,
});
export const AllInCommandSchema = z.object({
  ...identity,
  type: z.literal('game.all-in'),
});

export const BettingCommandSchema = z.discriminatedUnion('type', [
  FoldCommandSchema,
  CheckCommandSchema,
  CallCommandSchema,
  RaiseToCommandSchema,
  AllInCommandSchema,
]);

export type FoldCommand = z.infer<typeof FoldCommandSchema>;
export type CheckCommand = z.infer<typeof CheckCommandSchema>;
export type CallCommand = z.infer<typeof CallCommandSchema>;
export type RaiseToCommand = z.infer<typeof RaiseToCommandSchema>;
export type AllInCommand = z.infer<typeof AllInCommandSchema>;
export type BettingCommand = z.infer<typeof BettingCommandSchema>;
