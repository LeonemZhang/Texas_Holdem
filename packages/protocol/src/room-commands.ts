import { z } from 'zod';

import {
  CommandIdentitySchema,
  IdSchema,
  PositiveAmountSchema,
} from './primitives.js';

const CommandIdentityShape = CommandIdentitySchema.shape;

export const RoomSettingsSchema = z
  .object({
    roomName: z.string().trim().min(1),
    maxPlayers: z.number().int().min(2).max(10).safe(),
    initialChips: PositiveAmountSchema,
    smallBlind: PositiveAmountSchema,
    actionTimeoutSeconds: z.number().int().positive().safe(),
    handReadyTimeoutSeconds: z.number().int().positive().safe(),
    blindGrowth: z.object({
      enabled: z.boolean(),
      intervalHands: z.number().int().positive().safe(),
      mode: z.enum(['multiplier', 'increment']).optional(),
      multiplier: z.number().finite().gt(1).optional(),
      increment: PositiveAmountSchema.optional(),
      maxSmallBlind: PositiveAmountSchema.nullable().optional(),
    }),
    zeroChipPolicy: z.enum(['request-chips', 'eliminate']),
  })
  .superRefine((settings, context) => {
    const growth = settings.blindGrowth;
    const mode = growth.mode ?? 'multiplier';
    if (mode === 'multiplier' && growth.multiplier === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['blindGrowth', 'multiplier'],
        message: 'Multiplier is required for multiplier growth',
      });
    }
    if (mode === 'increment') {
      if (growth.increment === undefined) {
        context.addIssue({
          code: 'custom',
          path: ['blindGrowth', 'increment'],
          message: 'Increment is required for step growth',
        });
      } else if (growth.increment < settings.smallBlind) {
        context.addIssue({
          code: 'custom',
          path: ['blindGrowth', 'increment'],
          message: 'Increment must be at least the small blind',
        });
      }
    }
    if (
      growth.maxSmallBlind !== undefined &&
      growth.maxSmallBlind !== null &&
      growth.maxSmallBlind < settings.smallBlind
    ) {
      context.addIssue({
        code: 'custom',
        path: ['blindGrowth', 'maxSmallBlind'],
        message: 'Maximum small blind must be at least the small blind',
      });
    }
  });

export const CreateRoomCommandSchema = z.object({
  ...CommandIdentityShape,
  type: z.literal('room.create'),
  hostNickname: z.string().trim().min(1),
  settings: RoomSettingsSchema,
});

export const JoinRoomCommandSchema = z.object({
  ...CommandIdentityShape,
  type: z.literal('room.join'),
  nickname: z.string().trim().min(1),
});

export const SetLobbyReadyCommandSchema = z.object({
  ...CommandIdentityShape,
  type: z.literal('room.set-lobby-ready'),
  ready: z.boolean(),
});

export const UpdateRoomSettingsCommandSchema = z.object({
  ...CommandIdentityShape,
  type: z.literal('room.update-settings'),
  settings: RoomSettingsSchema,
});

export const StartFirstHandCommandSchema = z.object({
  ...CommandIdentityShape,
  type: z.literal('room.start-first-hand'),
  handId: IdSchema,
});

const simpleCommand = <T extends string>(type: T) =>
  z.object({ ...CommandIdentityShape, type: z.literal(type) });

export const PauseRoomCommandSchema = simpleCommand('room.pause');
export const ResumeRoomCommandSchema = simpleCommand('room.resume');
export const ExitRoomCommandSchema = simpleCommand('room.exit');
export const CloseRoomCommandSchema = simpleCommand('room.close');
export const RemovePlayerCommandSchema = z.object({
  ...CommandIdentityShape,
  type: z.literal('room.remove-player'),
  targetPlayerId: IdSchema,
});
export const ReseatPlayerCommandSchema = z.object({
  ...CommandIdentityShape,
  type: z.literal('room.reseat-player'),
  targetPlayerId: IdSchema,
  seatIndex: z.number().int().min(0).max(9),
});
export const ShuffleSeatsCommandSchema = simpleCommand('room.shuffle-seats');

export const RoomCommandSchema = z.discriminatedUnion('type', [
  CreateRoomCommandSchema,
  JoinRoomCommandSchema,
  SetLobbyReadyCommandSchema,
  UpdateRoomSettingsCommandSchema,
  StartFirstHandCommandSchema,
  PauseRoomCommandSchema,
  ResumeRoomCommandSchema,
  RemovePlayerCommandSchema,
  ReseatPlayerCommandSchema,
  ShuffleSeatsCommandSchema,
  ExitRoomCommandSchema,
  CloseRoomCommandSchema,
]);

export type RoomSettingsMessage = z.infer<typeof RoomSettingsSchema>;
export type CreateRoomCommand = z.infer<typeof CreateRoomCommandSchema>;
export type JoinRoomCommand = z.infer<typeof JoinRoomCommandSchema>;
export type SetLobbyReadyCommand = z.infer<typeof SetLobbyReadyCommandSchema>;
export type UpdateRoomSettingsCommand = z.infer<
  typeof UpdateRoomSettingsCommandSchema
>;
export type StartFirstHandCommand = z.infer<typeof StartFirstHandCommandSchema>;
export type ReseatPlayerCommand = z.infer<typeof ReseatPlayerCommandSchema>;
export type ShuffleSeatsCommand = z.infer<typeof ShuffleSeatsCommandSchema>;
export type RoomCommand = z.infer<typeof RoomCommandSchema>;
