import { z } from 'zod';

import { CommandIdentitySchema } from './primitives.js';

export const ShowHoleCardsCommandSchema = z.object({
  ...CommandIdentitySchema.shape,
  type: z.literal('game.show-hole-cards'),
});

export type ShowHoleCardsCommand = z.infer<typeof ShowHoleCardsCommandSchema>;
