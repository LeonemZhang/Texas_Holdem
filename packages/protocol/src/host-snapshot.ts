import { z } from 'zod';

import {
  AmountSchema,
  IdSchema,
  ProtocolVersionSchema,
  SequenceSchema,
  StateVersionSchema,
} from './primitives.js';
import { HandTypeSchema, PublicPlayerSchema } from './player-snapshot.js';
import { RoomSettingsSchema } from './room-commands.js';

const CardCodeSchema = z.string().regex(/^[2-9TJQKA][cdhs]$/);
const StreetPotSchema = z.object({
  street: z.enum(['preflop', 'flop', 'turn', 'river']),
  amount: AmountSchema,
});

const PublicSettlementSchema = z.object({
  reason: z.enum(['uncontested', 'showdown']),
  winnerIds: z.array(IdSchema).min(1),
  payouts: z.record(IdSchema, AmountSchema),
  netChanges: z.record(IdSchema, z.number().int().safe()),
  showdownResults: z.array(
    z.object({
      playerId: IdSchema,
      handType: HandTypeSchema,
      bestFiveCards: z.array(CardCodeSchema).length(5),
    }),
  ),
  revealedHandResults: z
    .array(
      z.object({
        playerId: IdSchema,
        handType: HandTypeSchema,
        bestFiveCards: z.array(CardCodeSchema).length(5),
      }),
    )
    .optional(),
  voluntaryRevealedHoleCards: z.record(
    IdSchema,
    z.array(CardCodeSchema).length(2),
  ),
});

/**
 * Public room projection for the independent Host control session.
 * It deliberately has no ownHoleCards, legalActions, or deck-order fields.
 */
export const HostManagementSnapshotSchema = z.object({
  protocolVersion: ProtocolVersionSchema,
  roomId: IdSchema,
  hostId: IdSchema,
  hostParticipation: z.enum(['player', 'service-only']),
  sequence: SequenceSchema,
  stateVersion: StateVersionSchema,
  room: z.object({
    roomName: z.string().trim().min(1),
    phase: z.enum(['lobby', 'playing', 'hand-ready', 'paused', 'closed']),
    settings: RoomSettingsSchema,
    currentSmallBlind: AmountSchema,
    currentBigBlind: AmountSchema,
    completedHands: AmountSchema,
    players: z.array(PublicPlayerSchema).max(10),
  }),
  game: z
    .object({
      handId: IdSchema,
      handNumber: z.number().int().positive().safe().optional(),
      street: z.enum(['preflop', 'flop', 'turn', 'river', 'settled']),
      buttonPlayerId: IdSchema,
      smallBlindPlayerId: IdSchema,
      bigBlindPlayerId: IdSchema,
      currentActorId: IdSchema.nullable(),
      actionDeadlineMs: z.number().int().nonnegative().safe().nullable(),
      communityCards: z.array(CardCodeSchema).max(5),
      totalPot: AmountSchema,
      streetPots: z.array(StreetPotSchema).max(4),
      showdownHoleCards: z
        .record(IdSchema, z.array(CardCodeSchema).length(2))
        .optional(),
      settlement: PublicSettlementSchema.nullable().optional(),
    })
    .nullable(),
  handReady: z
    .object({
      deadlineMs: z.number().int().nonnegative().safe(),
      players: z.array(
        z.object({
          playerId: IdSchema,
          choice: z.enum(['pending', 'ready', 'sitting-out']),
        }),
      ),
    })
    .nullable(),
});

export type HostManagementSnapshot = z.infer<
  typeof HostManagementSnapshotSchema
>;
