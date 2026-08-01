import { applyHandAction, type BettingAction } from '@texas-holdem/poker-core';
import type { BettingCommand } from '@texas-holdem/protocol';

import { freezeRoom, type RoomState } from '../domain/room.js';
import type { CommandHandlerResult } from './command-dispatcher.js';
import type { RoomCommandHandler } from './room-command-handler.js';
import type { RoomRepository } from './room-registry.js';

function toBettingAction(command: BettingCommand): BettingAction {
  switch (command.type) {
    case 'game.fold':
      return { type: 'fold' };
    case 'game.check':
      return { type: 'check' };
    case 'game.call':
      return { type: 'call' };
    case 'game.raise-to':
      return { type: 'raiseTo', amount: command.amount };
    case 'game.all-in':
      return { type: 'allIn' };
  }
}

export class GameCommandHandler {
  constructor(
    private readonly rooms: RoomRepository,
    private readonly runtime: RoomCommandHandler,
  ) {}

  handle(
    command: BettingCommand,
    room: RoomState | null,
  ): CommandHandlerResult {
    if (!room) throw new RangeError('Room not found');
    if (room.phase !== 'playing') {
      throw new RangeError('Betting commands require a playing room');
    }
    const hand = this.runtime.getCurrentHand(room.roomId);
    if (!hand) throw new RangeError('Active hand not found');

    const nextHand = applyHandAction(
      hand,
      command.playerId,
      toBettingAction(command),
    );
    this.runtime.replaceCurrentHand(room.roomId, nextHand);
    const nextRoom = freezeRoom({ ...room, version: room.version + 1 });
    this.rooms.save(nextRoom);
    return { stateVersion: nextRoom.version, sequence: 0 };
  }
}
