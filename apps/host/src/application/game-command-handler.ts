import {
  advanceAfterCompletedBetting,
  applyHandAction,
  createHandSummary,
  isBettingRoundComplete,
  settleShowdown,
  settleUncontestedHand,
  type BettingAction,
  type HandSummaryEvent,
  type ShowdownSettledHand,
  type StartedHandState,
  type UncontestedSettledHand,
} from '@texas-holdem/poker-core';
import type { BettingCommand } from '@texas-holdem/protocol';

import { freezeRoom, type RoomState } from '../domain/room.js';
import { beginHandReadyPhase } from '../domain/hand-ready.js';
import { syncLiveChipBalances } from './live-chip-balances.js';
import type { CommandHandlerResult } from './command-dispatcher.js';
import type { RoomCommandHandler } from './room-command-handler.js';
import type { RoomRepository } from './room-registry.js';
import type { PlayerActionEvent } from '../statistics/basic-statistics.js';

export interface GameCommandHandlerHooks {
  readonly onPlayerAction?: (event: PlayerActionEvent) => void;
  readonly onHandSettled?: (summary: HandSummaryEvent) => void;
}

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
    private readonly nowMs: () => number = Date.now,
    private readonly hooks: GameCommandHandlerHooks = {},
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

    let nextHand = applyHandAction(
      hand,
      command.playerId,
      toBettingAction(command),
    );
    this.hooks.onPlayerAction?.({
      type: 'player.action',
      handId: hand.handId,
      playerId: command.playerId,
      action:
        command.type === 'game.raise-to'
          ? 'raiseTo'
          : command.type.slice('game.'.length),
      street: hand.street,
    } as PlayerActionEvent);
    if (isBettingRoundComplete(nextHand.betting)) {
      const contenders = nextHand.players.filter(
        ({ status }) => status !== 'folded',
      );
      if (contenders.length === 1) {
        return this.settle(nextHand, room, settleUncontestedHand(nextHand));
      }
      if (nextHand.street === 'river') {
        return this.settle(nextHand, room, settleShowdown(nextHand));
      }
      nextHand = advanceAfterCompletedBetting(nextHand);
      if (
        nextHand.street === 'river' &&
        isBettingRoundComplete(nextHand.betting)
      ) {
        return this.settle(nextHand, room, settleShowdown(nextHand));
      }
    }
    this.runtime.replaceCurrentHand(room.roomId, nextHand);
    const nextRoom = syncLiveChipBalances(
      freezeRoom({ ...room, version: room.version + 1 }),
      nextHand,
    );
    this.rooms.save(nextRoom);
    return { stateVersion: nextRoom.version, sequence: 0 };
  }

  resolveAutomatic(room: RoomState): CommandHandlerResult | null {
    if (room.phase !== 'playing') return null;
    const hand = this.runtime.getCurrentHand(room.roomId);
    if (
      !hand ||
      hand.betting.currentActorId !== null ||
      !isBettingRoundComplete(hand.betting)
    ) {
      return null;
    }
    const contenders = hand.players.filter(({ status }) => status !== 'folded');
    if (contenders.length === 1) {
      return this.settle(hand, room, settleUncontestedHand(hand));
    }
    if (hand.street === 'river') {
      return this.settle(hand, room, settleShowdown(hand));
    }
    const progressed = advanceAfterCompletedBetting(hand);
    return this.settle(progressed, room, settleShowdown(progressed));
  }

  private settle(
    progressedHand: StartedHandState,
    room: RoomState,
    settledHand: UncontestedSettledHand | ShowdownSettledHand,
  ): CommandHandlerResult {
    this.hooks.onHandSettled?.(createHandSummary(settledHand));
    this.runtime.replaceCurrentHand(room.roomId, settledHand);
    const stacks = new Map(
      settledHand.players.map(({ playerId, stack }) => [playerId, stack]),
    );
    const roomWithStacks = freezeRoom({
      ...room,
      players: room.players.map((player) => {
        const chips = stacks.get(player.playerId) ?? player.chips;
        return {
          ...player,
          chips,
          status:
            chips === 0 && room.settings.zeroChipPolicy === 'eliminate'
              ? ('eliminated' as const)
              : player.status,
        };
      }),
      version: room.version + 1,
    });
    const ready = beginHandReadyPhase(
      roomWithStacks,
      progressedHand.handId,
      this.nowMs(),
    );
    this.runtime.enterHandReady(ready);
    return { stateVersion: ready.room.version, sequence: 0 };
  }
}
