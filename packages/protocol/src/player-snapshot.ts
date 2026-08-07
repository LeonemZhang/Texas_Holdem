import { z } from 'zod';

import {
  AmountSchema,
  IdSchema,
  ProtocolVersionSchema,
  SequenceSchema,
  StateVersionSchema,
  TimestampMsSchema,
} from './primitives.js';
import { RoomSettingsSchema } from './room-commands.js';

const CardCodeSchema = z.string().regex(/^[2-9TJQKA][cdhs]$/);
export const HandTypeSchema = z.enum([
  'high-card',
  'one-pair',
  'two-pair',
  'three-of-a-kind',
  'straight',
  'flush',
  'full-house',
  'four-of-a-kind',
  'straight-flush',
]);
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
    'removed',
    'disconnected',
  ]),
  isHost: z.boolean(),
  lobbyReady: z.boolean(),
});

export const ChipActivitySchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('request'),
    requestId: IdSchema,
    requesterId: IdSchema,
    targetPlayerId: IdSchema,
    amount: AmountSchema,
    status: z.enum(['pending', 'rejected', 'revoked', 'completed']),
    rejectedByPlayerIds: z.array(IdSchema),
    completedByPlayerId: IdSchema.nullable(),
    createdSequence: SequenceSchema,
    updatedSequence: SequenceSchema,
    createdAtMs: TimestampMsSchema,
    updatedAtMs: TimestampMsSchema,
  }),
  z.object({
    kind: z.literal('direct-transfer'),
    transferId: IdSchema,
    fromPlayerId: IdSchema,
    toPlayerId: IdSchema,
    amount: AmountSchema,
    completedSequence: SequenceSchema,
    completedAtMs: TimestampMsSchema,
  }),
]);

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
    settings: RoomSettingsSchema.optional(),
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
      ownHandType: HandTypeSchema.nullable().optional(),
      showdownHoleCards: z
        .record(IdSchema, z.array(CardCodeSchema).length(2))
        .optional()
        .default({}),
      settlement: z
        .object({
          reason: z.enum(['uncontested', 'showdown']),
          winnerIds: z.array(IdSchema).min(1),
          payouts: z.record(IdSchema, AmountSchema),
          netChanges: z.record(IdSchema, z.number().int().safe()),
          showdownResults: z
            .array(
              z.object({
                playerId: IdSchema,
                handType: HandTypeSchema,
                bestFiveCards: z.array(CardCodeSchema).length(5),
              }),
            )
            .default([]),
          revealedHandResults: z
            .array(
              z.object({
                playerId: IdSchema,
                handType: HandTypeSchema,
                bestFiveCards: z.array(CardCodeSchema).length(5),
              }),
            )
            .optional(),
          voluntaryRevealedHoleCards: z
            .record(IdSchema, z.array(CardCodeSchema).length(2))
            .optional()
            .default({}),
        })
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
          targetPlayerId: IdSchema,
          amount: AmountSchema,
          status: z.literal('pending'),
          rejectedByPlayerIds: z.array(IdSchema),
        }),
      ),
    })
    .nullable(),
  chipRequests: z.array(
    z.object({
      requestId: IdSchema,
      requesterId: IdSchema,
      targetPlayerId: IdSchema,
      amount: AmountSchema,
      status: z.literal('pending'),
      rejectedByPlayerIds: z.array(IdSchema),
    }),
  ),
  chipActivity: z.array(ChipActivitySchema),
  statistics: z.object({
    players: z.array(
      z.object({
        playerId: IdSchema,
        currentChips: AmountSchema,
        netWinLoss: z.number().int().safe(),
        participatedHands: AmountSchema,
        wonHands: AmountSchema,
        largestSingleHandProfit: AmountSchema,
        largestSingleHandLoss: AmountSchema,
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
    handPeaks: z
      .object({
        global: z
          .object({
            handType: HandTypeSchema,
            playerIds: z.array(IdSchema),
            bestFiveCards: z.array(CardCodeSchema).length(5),
          })
          .nullable(),
        players: z.array(
          z.object({
            playerId: IdSchema,
            handType: HandTypeSchema,
            bestFiveCards: z.array(CardCodeSchema).length(5),
          }),
        ),
        hasLegacyCoverageGap: z.boolean(),
      })
      .optional(),
  }),
});

export type LegalActions = z.infer<typeof LegalActionsSchema>;
export type ChipActivity = z.infer<typeof ChipActivitySchema>;
export type PlayerSnapshot = z.infer<typeof PlayerSnapshotSchema>;
export type HandType = z.infer<typeof HandTypeSchema>;
