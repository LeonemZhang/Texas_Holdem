import { z } from 'zod';

import {
  AmountSchema,
  IdSchema,
  ProtocolVersionSchema,
  SequenceSchema,
  StateVersionSchema,
} from './primitives.js';
import { RoomSettingsSchema } from './room-commands.js';

const EventMetadata = {
  protocolVersion: ProtocolVersionSchema,
  eventId: IdSchema,
  roomId: IdSchema,
  sequence: SequenceSchema,
  stateVersion: StateVersionSchema,
} as const;

const CardCodeSchema = z.string().regex(/^[2-9TJQKA][cdhs]$/);
const PlayerStatusSchema = z.enum([
  'waiting',
  'active',
  'sitting-out',
  'eliminated',
  'left',
  'removed',
  'disconnected',
]);

export const RoomCreatedEventSchema = z.object({
  ...EventMetadata,
  type: z.literal('room.created'),
  hostPlayerId: IdSchema,
  settings: RoomSettingsSchema,
});
export const PlayerJoinedEventSchema = z.object({
  ...EventMetadata,
  type: z.literal('player.joined'),
  playerId: IdSchema,
  nickname: z.string().trim().min(1),
  seatIndex: z.number().int().min(0).max(9),
  chips: AmountSchema,
});
export const PlayerStatusChangedEventSchema = z.object({
  ...EventMetadata,
  type: z.literal('player.status-changed'),
  playerId: IdSchema,
  status: PlayerStatusSchema,
});
export const LobbyReadyChangedEventSchema = z.object({
  ...EventMetadata,
  type: z.literal('lobby.ready-changed'),
  playerId: IdSchema,
  ready: z.boolean(),
});
export const HandStartedEventSchema = z.object({
  ...EventMetadata,
  type: z.literal('hand.started'),
  handId: IdSchema,
  buttonPlayerId: IdSchema,
  smallBlindPlayerId: IdSchema,
  bigBlindPlayerId: IdSchema,
});
export const PlayerActedEventSchema = z.object({
  ...EventMetadata,
  type: z.literal('hand.player-acted'),
  handId: IdSchema,
  playerId: IdSchema,
  action: z.enum(['fold', 'check', 'call', 'raiseTo', 'allIn']),
  amount: AmountSchema.optional(),
});
export const HandSummaryEventSchema = z.object({
  ...EventMetadata,
  type: z.literal('hand.summary'),
  handId: IdSchema,
  reason: z.enum(['uncontested', 'showdown']),
  communityCards: z.array(CardCodeSchema).max(5),
  investments: z.record(IdSchema, AmountSchema),
  winnerIds: z.array(IdSchema).min(1),
  payouts: z.record(IdSchema, AmountSchema),
  netChanges: z.record(IdSchema, z.number().int().safe()),
  revealedHoleCards: z.record(IdSchema, z.array(CardCodeSchema).length(2)),
});
export const HandReadyStartedEventSchema = z.object({
  ...EventMetadata,
  type: z.literal('hand-ready.started'),
  afterHandId: IdSchema,
  deadlineMs: z.number().int().nonnegative().safe(),
});
export const HandReadyChoiceChangedEventSchema = z.object({
  ...EventMetadata,
  type: z.literal('hand-ready.choice-changed'),
  playerId: IdSchema,
  choice: z.enum(['ready', 'sitting-out']),
});
export const ChipRequestChangedEventSchema = z.object({
  ...EventMetadata,
  type: z.literal('chips.request-changed'),
  requestId: IdSchema,
  requesterId: IdSchema,
  status: z.enum(['pending', 'rejected', 'revoked', 'completed']),
  amount: AmountSchema,
});
export const ChipTransferCompletedEventSchema = z.object({
  ...EventMetadata,
  type: z.literal('chips.transfer-completed'),
  transferId: IdSchema,
  fromPlayerId: IdSchema,
  toPlayerId: IdSchema,
  amount: AmountSchema,
});
export const RoomControlEventSchema = z.object({
  ...EventMetadata,
  type: z.literal('room.control-changed'),
  phase: z.enum(['playing', 'hand-ready', 'paused', 'closed']),
  normalClose: z.boolean().optional(),
});
export const StatisticsUpdatedEventSchema = z.object({
  ...EventMetadata,
  type: z.literal('statistics.updated'),
  playerId: IdSchema,
  currentChips: AmountSchema,
  participatedHands: AmountSchema,
  wonHands: AmountSchema,
});
export const TitlesUpdatedEventSchema = z.object({
  ...EventMetadata,
  type: z.literal('statistics.titles-updated'),
  titles: z.array(
    z.object({
      title: z.enum([
        'all-in-king',
        'unlucky-player',
        'pot-harvester',
        'double-up-master',
        'bluff-king',
        'river-killer',
        'tight-player',
      ]),
      playerIds: z.array(IdSchema),
      value: z.number().nonnegative().nullable(),
    }),
  ),
});

export const DomainEventSchema = z.discriminatedUnion('type', [
  RoomCreatedEventSchema,
  PlayerJoinedEventSchema,
  PlayerStatusChangedEventSchema,
  LobbyReadyChangedEventSchema,
  HandStartedEventSchema,
  PlayerActedEventSchema,
  HandSummaryEventSchema,
  HandReadyStartedEventSchema,
  HandReadyChoiceChangedEventSchema,
  ChipRequestChangedEventSchema,
  ChipTransferCompletedEventSchema,
  RoomControlEventSchema,
  StatisticsUpdatedEventSchema,
  TitlesUpdatedEventSchema,
]);

export type DomainEvent = z.infer<typeof DomainEventSchema>;
