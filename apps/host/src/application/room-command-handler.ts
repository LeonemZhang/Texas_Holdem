import type {
  RandomSource,
  ShowdownSettledHand,
  StartedHandState,
} from '@texas-holdem/poker-core';

import {
  createChipRequest,
  createChipRequestBook,
  carryChipRequestsToHandReady,
  rejectChipRequest,
  revokeChipRequest,
  revokeChipRequestsForPlayer,
  type ChipRequestBook,
} from '../domain/chip-requests.js';
import { approveChipRequest, giveChips } from '../domain/chip-transfers.js';
import type {
  BeginHandReadyResult,
  HandReadyState,
} from '../domain/hand-ready.js';
import {
  canBeginNextHand,
  normalizeHandReadyAtDeadline,
  removePlayerFromHandReady,
  restorePlayerToHandReady,
  setHandReadyChoice,
} from '../domain/hand-ready-actions.js';
import { joinRoom } from '../domain/join-room.js';
import { resumeLeftPlayer } from '../domain/reconnect.js';
import { setLobbyReady } from '../domain/lobby-ready.js';
import { reseatPlayer, shuffleLobbySeats } from '../domain/seat-management.js';
import { leaveRoom, removePlayer } from '../domain/player-status.js';
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
import { startNextRoomHand } from '../domain/start-next-hand.js';
import { syncLiveChipBalances } from './live-chip-balances.js';
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

  replaceCurrentHand(roomId: string, hand: StartedHandState): void {
    if (hand.handId !== this.#hands.get(roomId)?.handId) {
      throw new RangeError('Replacement hand does not match the active hand');
    }
    this.#hands.set(roomId, hand);
  }

  getHandReady(roomId: string): HandReadyState | null {
    return this.#handReady.get(roomId) ?? null;
  }

  getChipRequests(roomId: string): ChipRequestBook | null {
    return this.#chipRequests.get(roomId) ?? null;
  }

  resumeLeftPlayer(
    roomId: string,
    playerId: string,
    nickname?: string,
  ): RoomState {
    const room = this.requireRoom(this.rooms.get(roomId));
    const resumed = resumeLeftPlayer(room, playerId, nickname);
    if (room.phase === 'hand-ready') {
      const context = this.requireHandReady(roomId);
      this.#handReady.set(
        roomId,
        restorePlayerToHandReady(context.ready, playerId),
      );
    }
    this.rooms.save(resumed);
    return resumed;
  }

  retireRoom(roomId: string): void {
    this.#hands.delete(roomId);
    this.#handReady.delete(roomId);
    this.#chipRequests.delete(roomId);
    this.#paused.delete(roomId);
  }

  enterHandReady(result: BeginHandReadyResult): void {
    this.rooms.save(result.room);
    this.#handReady.set(result.room.roomId, result.handReady);
    const existing = this.#chipRequests.get(result.room.roomId);
    this.#chipRequests.set(
      result.room.roomId,
      existing
        ? carryChipRequestsToHandReady(existing, result.handReady)
        : createChipRequestBook(result.handReady),
    );
  }

  restoreState(input: {
    readonly room: RoomState;
    readonly hand: StartedHandState | null;
    readonly handReady: HandReadyState | null;
    readonly chipRequests: ChipRequestBook | null;
  }): void {
    this.rooms.save(input.room);
    if (input.hand) {
      // Runtime snapshots from before street-pot history are still valid hands.
      const hand = input.hand.completedStreetPots
        ? input.hand
        : Object.freeze({
            ...input.hand,
            completedStreetPots: Object.freeze([]),
          });
      this.#hands.set(input.room.roomId, hand);
    }
    if (input.handReady)
      this.#handReady.set(input.room.roomId, input.handReady);
    if (input.chipRequests) {
      this.#chipRequests.set(input.room.roomId, input.chipRequests);
    }
  }

  startNextHandIfReady(
    roomId: string,
    input: {
      readonly handId: string;
      readonly nowMs: number;
      readonly deadlineElapsed: boolean;
      readonly smallBlind: number;
    },
  ): RoomState | null {
    const room = this.rooms.get(roomId);
    const previousHand = this.#hands.get(roomId);
    const context = this.requireHandReady(roomId);
    if (!room || !previousHand) return null;
    let ready = context.ready;
    const requests = context.requests;
    if (input.deadlineElapsed) {
      ready = normalizeHandReadyAtDeadline(room, ready, input.nowMs);
      this.#handReady.set(roomId, ready);
      this.#chipRequests.set(roomId, requests);
    }
    const pendingRequests = requests.requests.filter(
      ({ status }) => status === 'pending',
    ).length;
    if (!canBeginNextHand(ready, input.deadlineElapsed ? 0 : pendingRequests))
      return null;
    const readyPlayerCount = room.players.filter(
      ({ playerId, chips, status }) =>
        ready.players.some(
          (player) => player.playerId === playerId && player.choice === 'ready',
        ) &&
        chips >= room.settings.bigBlind &&
        !['left', 'removed', 'eliminated'].includes(status),
    ).length;
    if (readyPlayerCount < 2) {
      if (!input.deadlineElapsed) return null;
      const normalizedRoom = incrementVersion(room);
      this.rooms.save(normalizedRoom);
      return normalizedRoom;
    }
    const started = startNextRoomHand(room, ready, requests, {
      handId: input.handId,
      previousButtonIndex: previousHand.positions.button.index,
      smallBlind: input.smallBlind,
      randomSource: this.randomSource,
      allowPendingRequests: input.deadlineElapsed,
    });
    const roomWithLiveChips = syncLiveChipBalances(started.room, started.hand);
    this.rooms.save(roomWithLiveChips);
    this.#hands.set(roomId, started.hand);
    this.#handReady.delete(roomId);
    if (pendingRequests === 0) this.#chipRequests.delete(roomId);
    return roomWithLiveChips;
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

  private requireChipRequests(roomId: string): ChipRequestBook {
    const requests = this.#chipRequests.get(roomId);
    if (!requests) throw new RangeError('Chip requests are not active');
    return requests;
  }

  private applyPlayingChipTransfer(
    room: RoomState,
    fromPlayerId: string,
    toPlayerId: string,
    amount: number,
  ): void {
    const hand = this.#hands.get(room.roomId);
    if (!hand) throw new RangeError('Active hand not found');
    const giver = hand.players.find(
      ({ playerId }) => playerId === fromPlayerId,
    );
    if (!giver) return;
    if (giver.stack < amount) {
      throw new RangeError('Giver has insufficient chips');
    }
    const adjust = <
      T extends { readonly playerId: string; readonly stack: number },
    >(
      player: T,
    ): T =>
      Object.freeze({
        ...player,
        stack:
          player.playerId === fromPlayerId
            ? player.stack - amount
            : player.playerId === toPlayerId
              ? player.stack + amount
              : player.stack,
      });
    this.#hands.set(
      room.roomId,
      Object.freeze({
        ...hand,
        players: Object.freeze(hand.players.map(adjust)),
        betting: Object.freeze({
          ...hand.betting,
          players: Object.freeze(hand.betting.players.map(adjust)),
        }),
      }),
    );
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
      case 'room.reseat-player':
        return this.accepted(
          reseatPlayer(
            room,
            command.playerId,
            command.targetPlayerId,
            command.seatIndex,
          ),
        );
      case 'room.shuffle-seats':
        return this.accepted(
          shuffleLobbySeats(room, command.playerId, this.randomSource),
        );
      case 'room.start-first-hand': {
        const started = startFirstHand(
          room,
          command.playerId,
          command.handId,
          this.randomSource,
        );
        this.#hands.set(room.roomId, started.hand);
        return this.accepted(syncLiveChipBalances(started.room, started.hand));
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
      case 'room.remove-player': {
        const nextRoom = removePlayer(
          room,
          command.playerId,
          command.targetPlayerId,
        );
        if (room.phase === 'hand-ready') {
          const context = this.requireHandReady(room.roomId);
          this.#handReady.set(
            room.roomId,
            removePlayerFromHandReady(context.ready, command.targetPlayerId),
          );
          this.#chipRequests.set(
            room.roomId,
            revokeChipRequestsForPlayer(
              context.requests,
              command.targetPlayerId,
            ),
          );
        }
        return this.accepted(nextRoom);
      }
      case 'room.close':
        return this.accepted(closeRoom(room, command.playerId).room);
      case 'game.show-hole-cards': {
        const hand = this.#hands.get(room.roomId);
        if (room.phase !== 'hand-ready' || !hand || !('settlement' in hand)) {
          throw new RangeError(
            'Showing hole cards requires a settled hand-ready room',
          );
        }
        if (
          !hand.players.some(({ playerId }) => playerId === command.playerId)
        ) {
          throw new RangeError('Only a hand participant can show hole cards');
        }
        if (
          room.voluntarilyRevealedHoleCardPlayerIds.includes(command.playerId)
        ) {
          throw new RangeError('Hole cards were already voluntarily revealed');
        }
        const settledHand = hand as ShowdownSettledHand;
        if (
          settledHand.settlement.reason === 'showdown' &&
          command.playerId in settledHand.settlement.revealedHoleCards
        ) {
          throw new RangeError('Showdown hole cards are already public');
        }
        return this.accepted(
          freezeRoom({
            ...room,
            version: room.version + 1,
            voluntarilyRevealedHoleCardPlayerIds: [
              ...room.voluntarilyRevealedHoleCardPlayerIds,
              command.playerId,
            ],
          }),
        );
      }
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
            targetPlayerId: command.targetPlayerId,
            amount: command.amount,
            ...(command.note === undefined ? {} : { note: command.note }),
          }),
        );
        return this.accepted(incrementVersion(room));
      }
      case 'chips.revoke': {
        const requests = this.requireChipRequests(room.roomId);
        this.#chipRequests.set(
          room.roomId,
          revokeChipRequest(requests, command.requestId, command.playerId),
        );
        return this.accepted(incrementVersion(room));
      }
      case 'chips.reject': {
        const requests = this.requireChipRequests(room.roomId);
        this.#chipRequests.set(
          room.roomId,
          rejectChipRequest(requests, command.requestId, command.playerId),
        );
        return this.accepted(incrementVersion(room));
      }
      case 'chips.approve': {
        const requests = this.requireChipRequests(room.roomId);
        const request = requests.requests.find(
          ({ requestId }) => requestId === command.requestId,
        );
        const activeHand = this.#hands.get(room.roomId);
        const availableChipsByPlayerId =
          room.phase === 'playing' && activeHand
            ? Object.fromEntries(
                activeHand.players.map(({ playerId, stack }) => [
                  playerId,
                  stack,
                ]),
              )
            : undefined;
        const roomWithLiveChips =
          room.phase === 'playing' && activeHand
            ? syncLiveChipBalances(room, activeHand)
            : room;
        const transferred = approveChipRequest(
          roomWithLiveChips,
          requests,
          command.requestId,
          command.playerId,
          command.transferId,
          availableChipsByPlayerId,
        );
        if (room.phase === 'playing' && request) {
          this.applyPlayingChipTransfer(
            roomWithLiveChips,
            command.playerId,
            request.requesterId,
            request.amount,
          );
        }
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
