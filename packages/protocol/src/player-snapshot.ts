import { z } from 'zod';

import {
  AmountSchema,
  IdSchema,
  ProtocolVersionSchema,
  SequenceSchema,
  StateVersionSchema,
} from './primitives.js';

const CardCodeSchema = z.string().regex(/^[2-9TJQKA][cdhs]$/);
const StreetPotSchema = z.object({
  street: z.enum(['preflop', 'flop', 'turn', 'river']),
  amount: AmountSchema,
});

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
  streetCommitted: AmountSchema.optional().default(0),
  totalCommitted: AmountSchema.optional().default(0),
  actionOrder: z.number().int().positive().nullable().optional(),
  lastAction: z
    .enum(['fold', 'check', 'call', 'raiseTo', 'allIn'])
    .nullable()
    .optional(),
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
  lobbyReady: z.boolean(),
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
    initialChips: AmountSchema,
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
      actionDeadlineMs: z
        .number()
        .int()
        .nonnegative()
        .safe()
        .nullable()
        .optional()
        .default(null),
      communityCards: z.array(CardCodeSchema).max(5),
      totalPot: AmountSchema.optional().default(0),
      streetPots: z.array(StreetPotSchema).max(4).optional().default([]),
      ownHoleCards: z.array(CardCodeSchema).length(2).nullable(),
      showdownHoleCards: z
        .record(IdSchema, z.array(CardCodeSchema).length(2))
        .optional()
        .default({}),
      settlement: z
        .object({
          reason: z.enum(['uncontested', 'showdown']),
          winnerIds: z.array(IdSchema).min(1),
          payouts: z.record(IdSchema, AmountSchema),
        })
          netChanges: z.record(IdSchema, z.number().int().safe()),
          showdownResults: z
            .array(
              z.object({
                playerId: IdSchema,
                handType: z.enum([
                  'high-card',
                  'one-pair',
                  'two-pair',
                  'three-of-a-kind',
                  'straight',
                  'flush',
                  'full-house',
                  'four-of-a-kind',
                  'straight-flush',
                ]),
                bestFiveCards: z.array(CardCodeSchema).length(5),
              }),
            )
            .default([]),
          voluntaryRevealedHoleCards: z
            .record(IdSchema, z.array(CardCodeSchema).length(2))
            .optional()
            .default({}),
        .nullable()
        .optional(),
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
  chipRequests: z
    .array(
      z.object({
        requestId: IdSchema,
        requesterId: IdSchema,
        targetPlayerId: IdSchema.nullable(),
        amount: AmountSchema,
        status: z.enum(['pending', 'rejected', 'revoked', 'completed']),
      }),
    )
    .default([]),
    players: z.array(
      z.object({
        playerId: IdSchema,
        currentChips: AmountSchema,
        participatedHands: AmountSchema,
        wonHands: AmountSchema,
        largestSingleHandProfit: AmountSchema,
        largestWonPot: AmountSchema,
        showdownCount: AmountSchema,
        showdownWinRate: z.number().min(0).max(1).nullable(),
        actions: z.object({
          fold: AmountSchema,
          check: AmountSchema,
          call: AmountSchema,
          raiseTo: AmountSchema,
          allIn: AmountSchema,
        }),
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
