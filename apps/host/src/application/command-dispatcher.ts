import {
  BettingCommandSchema,
  HandReadyCommandSchema,
  PROTOCOL_VERSION,
  RoomCommandSchema,
  ShowHoleCardsCommandSchema,
  type CommandResponse,
} from '@texas-holdem/protocol';
import { z } from 'zod';

import type { RoomState } from '../domain/room.js';
import type { RoomRepository } from './room-registry.js';

export const ClientCommandSchema = z.union([
  RoomCommandSchema,
  BettingCommandSchema,
  HandReadyCommandSchema,
  ShowHoleCardsCommandSchema,
]);
export type ClientCommand = z.infer<typeof ClientCommandSchema>;

export interface CommandHandlerResult {
  readonly stateVersion: number;
  readonly sequence: number;
}

export type CommandHandler = (
  command: ClientCommand,
  room: RoomState | null,
) => CommandHandlerResult;
export type CommandAuthorizer = (
  command: ClientCommand,
  room: RoomState | null,
) => boolean;

export class CommandDispatcher {
  private readonly results = new Map<string, CommandResponse>();

  constructor(
    private readonly rooms: RoomRepository,
    private readonly authorize: CommandAuthorizer,
    private readonly handle: CommandHandler,
  ) {}

  dispatch(input: unknown): CommandResponse {
    const parsed = ClientCommandSchema.safeParse(input);
    if (!parsed.success) {
      const commandId =
        typeof input === 'object' &&
        input !== null &&
        'commandId' in input &&
        typeof input.commandId === 'string' &&
        input.commandId.trim()
          ? input.commandId
          : 'unknown-command';
      return {
        protocolVersion: PROTOCOL_VERSION,
        commandId,
        status: 'rejected',
        error: {
          code: 'INVALID_MESSAGE',
          message: 'Command schema validation failed',
        },
      };
    }
    const command = parsed.data;
    const resultKey = `${command.playerId}\u0000${command.commandId}`;
    const previousResult = this.results.get(resultKey);
    if (previousResult) {
      return previousResult;
    }
    const room = this.rooms.get(command.roomId);
    if (!room && command.type !== 'room.create') {
      return this.remember(resultKey, {
        protocolVersion: PROTOCOL_VERSION,
        commandId: command.commandId,
        status: 'rejected',
        error: { code: 'NOT_FOUND', message: 'Room not found' },
      });
    }
    if (room && command.expectedVersion !== room.version) {
      return this.remember(resultKey, {
        protocolVersion: PROTOCOL_VERSION,
        commandId: command.commandId,
        status: 'conflict',
        expectedVersion: command.expectedVersion,
        currentVersion: room.version,
        error: { code: 'CONFLICT', message: 'Room state version changed' },
      });
    }
    if (!this.authorize(command, room)) {
      return this.remember(resultKey, {
        protocolVersion: PROTOCOL_VERSION,
        commandId: command.commandId,
        status: 'unauthorized',
        error: {
          code: 'UNAUTHORIZED',
          message: 'Command identity is not authorized',
        },
      });
    }
    const result = this.handle(command, room);
    return this.remember(resultKey, {
      protocolVersion: PROTOCOL_VERSION,
      commandId: command.commandId,
      status: 'accepted',
      stateVersion: result.stateVersion,
      sequence: result.sequence,
    });
  }

  private remember(key: string, response: CommandResponse): CommandResponse {
    this.results.set(key, response);
    return response;
  }
}
