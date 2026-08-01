import { z } from 'zod';

import {
  AmountSchema,
  IdSchema,
  ProtocolVersionSchema,
  SequenceSchema,
  StateVersionSchema,
} from './primitives.js';

const CardCodeSchema = z.string().regex(/^[2-9TJQKA][cdhs]$/);

export const LegalActionsSchema = z.object({
  canFold: z.boolean(),
  canCheck: z.boolean(),
  callAmount: AmountSchema.nullable(),
  minimumRaiseTo: AmountSchema.nullable(),
  maximumRaiseTo: AmountSchema.nullable(),
  canAllIn: z.boolean(),
});

export const PublicPlayerSchema = z.object({
  playerId: IdSchema,
  nickname: z.string().trim().min(1),
  seatIndex: z.number().int().min(0).max(9),
  chips: AmountSchema,
  status: z.enum([
    'waiting',
    'active',
    'folded',
    'all-in',
    'sitting-out',
    'eliminated',
    'left',
    'disconnected',
  ]),
  isHost: z.boolean(),
});

export const PlayerSnapshotSchema = z.object({
  protocolVersion: ProtocolVersionSchema,
  roomId: IdSchema,
  playerId: IdSchema,
  sequence: SequenceSchema,
  stateVersion: StateVersionSchema,
  room: z.object({
    roomName: z.string().trim().min(1),
    phase: z.enum(['lobby', 'playing', 'hand-ready', 'paused', 'closed']),
    smallBlind: AmountSchema,
    bigBlind: AmountSchema,
    completedHands: AmountSchema,
    players: z.array(PublicPlayerSchema).max(10),
  }),
  game: z
    .object({
      handId: IdSchema,
      street: z.enum(['preflop', 'flop', 'turn', 'river', 'settled']),
      buttonPlayerId: IdSchema,
      smallBlindPlayerId: IdSchema,
      bigBlindPlayerId: IdSchema,
      currentActorId: IdSchema.nullable(),
      communityCards: z.array(CardCodeSchema).max(5),
      pots: z.array(
        z.object({
          amount: AmountSchema,
          eligiblePlayerIds: z.array(IdSchema),
        }),
      ),
      ownHoleCards: z.array(CardCodeSchema).length(2).nullable(),
      legalActions: LegalActionsSchema.nullable(),
    })
    .nullable(),
  handReady: z
    .object({
      deadlineMs: z.number().int().nonnegative().safe(),
      ownChoice: z.enum(['pending', 'ready', 'sitting-out']),
      pendingRequests: z.array(
        z.object({
          requestId: IdSchema,
          requesterId: IdSchema,
          targetPlayerId: IdSchema.nullable(),
          amount: AmountSchema,
          status: z.enum(['pending', 'rejected', 'revoked', 'completed']),
        }),
      ),
    })
    .nullable(),
  statistics: z.object({
    players: z.array(
      z.object({
        playerId: IdSchema,
        currentChips: AmountSchema,
        participatedHands: AmountSchema,
        wonHands: AmountSchema,
        showdownWinRate: z.number().min(0).max(1).nullable(),
      }),
    ),
    titles: z.array(
      z.object({
        title: z.string().trim().min(1),
        playerIds: z.array(IdSchema),
        value: z.number().nonnegative().nullable(),
      }),
    ),
  }),
});

export type LegalActions = z.infer<typeof LegalActionsSchema>;
export type PlayerSnapshot = z.infer<typeof PlayerSnapshotSchema>;
