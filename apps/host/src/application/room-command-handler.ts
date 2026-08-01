import type { RandomSource, StartedHandState } from '@texas-holdem/poker-core';

import {
  createChipRequest,
  createChipRequestBook,
  rejectChipRequest,
  revokeChipRequest,
  type ChipRequestBook,
} from '../domain/chip-requests.js';
import { approveChipRequest, giveChips } from '../domain/chip-transfers.js';
import type {
  BeginHandReadyResult,
  HandReadyState,
} from '../domain/hand-ready.js';
import { setHandReadyChoice } from '../domain/hand-ready-actions.js';
import { joinRoom } from '../domain/join-room.js';
import { setLobbyReady } from '../domain/lobby-ready.js';
import { leaveRoom } from '../domain/player-status.js';
import { createRoom, freezeRoom, type RoomState } from '../domain/room.js';
import {
  closeRoom,
  pauseRoom,
  resumeRoom,
  type PausedRoomState,
} from '../domain/room-control.js';
import {
  PRESET_SMALL_BLINDS,
  type BlindSetting,
  type PresetSmallBlind,
} from '../domain/room-settings.js';
import { startFirstHand } from '../domain/start-first-hand.js';
import type {
  ClientCommand,
  CommandHandler,
  CommandHandlerResult,
} from './command-dispatcher.js';
import type { RoomRepository } from './room-registry.js';

function blindSetting(smallBlind: number): BlindSetting {
  if (PRESET_SMALL_BLINDS.includes(smallBlind as PresetSmallBlind)) {
    return { kind: 'preset', smallBlind: smallBlind as PresetSmallBlind };
  }
  return { kind: 'custom', smallBlind };
}

function incrementVersion(room: RoomState): RoomState {
  return freezeRoom({ ...room, version: room.version + 1 });
}

export class RoomCommandHandler {
  readonly handle: CommandHandler = (command, room) =>
    this.handleCommand(command, room);

  readonly #hands = new Map<string, StartedHandState>();
  readonly #handReady = new Map<string, HandReadyState>();
  readonly #chipRequests = new Map<string, ChipRequestBook>();
  readonly #paused = new Map<string, PausedRoomState>();

  constructor(
    private readonly rooms: RoomRepository,
    private readonly randomSource: RandomSource,
  ) {}

  getCurrentHand(roomId: string): StartedHandState | null {
    return this.#hands.get(roomId) ?? null;
  }

  getHandReady(roomId: string): HandReadyState | null {
    return this.#handReady.get(roomId) ?? null;
  }

  getChipRequests(roomId: string): ChipRequestBook | null {
    return this.#chipRequests.get(roomId) ?? null;
  }

  enterHandReady(result: BeginHandReadyResult): void {
    this.rooms.save(result.room);
    this.#handReady.set(result.room.roomId, result.handReady);
    this.#chipRequests.set(
      result.room.roomId,
      createChipRequestBook(result.handReady),
    );
  }

  private accepted(room: RoomState): CommandHandlerResult {
    this.rooms.save(room);
    return { stateVersion: room.version, sequence: 0 };
  }

  private requireRoom(room: RoomState | null): RoomState {
    if (!room) throw new RangeError('Room not found');
    return room;
  }

  private requireHandReady(roomId: string): {
    ready: HandReadyState;
    requests: ChipRequestBook;
  } {
    const ready = this.#handReady.get(roomId);
    const requests = this.#chipRequests.get(roomId);
    if (!ready || !requests) {
      throw new RangeError('Hand-ready context is not active');
    }
    return { ready, requests };
  }

  private handleCommand(
    command: ClientCommand,
    currentRoom: RoomState | null,
  ): CommandHandlerResult {
    if (command.type === 'room.create') {
      if (currentRoom) throw new RangeError('Room already exists');
      return this.accepted(
        createRoom({
          roomId: command.roomId,
          hostPlayerId: command.playerId,
          hostNickname: command.hostNickname,
          settings: {
            ...command.settings,
            blind: blindSetting(command.settings.smallBlind),
          },
        }),
      );
    }

    const room = this.requireRoom(currentRoom);
    switch (command.type) {
      case 'room.join':
        return this.accepted(
          joinRoom(room, {
            playerId: command.playerId,
            nickname: command.nickname,
          }),
        );
      case 'room.set-lobby-ready':
        return this.accepted(
          setLobbyReady(room, command.playerId, command.ready),
        );
      case 'room.start-first-hand': {
        const started = startFirstHand(
          room,
          command.playerId,
          command.handId,
          this.randomSource,
        );
        this.#hands.set(room.roomId, started.hand);
        return this.accepted(started.room);
      }
      case 'room.pause': {
        const paused = pauseRoom(room, command.playerId);
        this.#paused.set(room.roomId, paused);
        return this.accepted(paused.room);
      }
      case 'room.resume': {
        const paused = this.#paused.get(room.roomId);
        if (!paused) throw new RangeError('Paused room context not found');
        const resumed = resumeRoom(paused, command.playerId);
        this.#paused.delete(room.roomId);
        return this.accepted(resumed);
      }
      case 'room.exit':
        return this.accepted(leaveRoom(room, command.playerId));
      case 'room.close':
        return this.accepted(closeRoom(room, command.playerId).room);
      case 'hand-ready.set-choice': {
        const context = this.requireHandReady(room.roomId);
        this.#handReady.set(
          room.roomId,
          setHandReadyChoice(
            room,
            context.ready,
            command.playerId,
            command.choice,
          ),
        );
        return this.accepted(incrementVersion(room));
      }
      case 'chips.request': {
        const context = this.requireHandReady(room.roomId);
        this.#chipRequests.set(
          room.roomId,
          createChipRequest(room, context.ready, context.requests, {
            requestId: command.requestId,
            requesterId: command.playerId,
            targetPlayerId:
              command.audience === 'targeted' ? command.targetPlayerId : null,
            amount: command.amount,
            ...(command.note === undefined ? {} : { note: command.note }),
          }),
        );
        return this.accepted(incrementVersion(room));
      }
      case 'chips.revoke': {
        const context = this.requireHandReady(room.roomId);
        this.#chipRequests.set(
          room.roomId,
          revokeChipRequest(
            context.requests,
            command.requestId,
            command.playerId,
          ),
        );
        return this.accepted(incrementVersion(room));
      }
      case 'chips.reject': {
        const context = this.requireHandReady(room.roomId);
        this.#chipRequests.set(
          room.roomId,
          rejectChipRequest(
            room,
            context.requests,
            command.requestId,
            command.playerId,
          ),
        );
        return this.accepted(incrementVersion(room));
      }
      case 'chips.approve': {
        const context = this.requireHandReady(room.roomId);
        const transferred = approveChipRequest(
          room,
          context.requests,
          command.requestId,
          command.playerId,
          command.transferId,
        );
        this.#chipRequests.set(room.roomId, transferred.requests);
        return this.accepted(transferred.room);
      }
      case 'chips.give': {
        const context = this.requireHandReady(room.roomId);
        const transferred = giveChips(room, context.requests, {
          transferId: command.transferId,
          giverPlayerId: command.playerId,
          receiverPlayerId: command.receiverPlayerId,
          amount: command.amount,
        });
        this.#chipRequests.set(room.roomId, transferred.requests);
        return this.accepted(transferred.room);
      }
      default:
        throw new RangeError(
          `Unsupported command in room handler: ${command.type}`,
        );
    }
  }
}
