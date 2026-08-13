import {
  advanceRunoutStreet,
  advanceAfterCompletedBetting,
  applyHandAction,
  createHandSummary,
  hasFurtherBettingCompetition,
  isContender,
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
import type {
  PlayerActionEvent,
  RecordedPlayerAction,
} from '../statistics/basic-statistics.js';

export interface GameCommandHandlerHooks {
  readonly onPlayerAction?: (event: PlayerActionEvent) => void;
  readonly onHandSettled?: (summary: HandSummaryEvent) => void;
}

type CompletedBettingTransition =
  | {
      readonly type: 'settle-uncontested';
      readonly hand: StartedHandState;
    }
  | {
      readonly type: 'settle-showdown';
      readonly hand: StartedHandState;
    }
  | {
      readonly type: 'continue';
      readonly hand: StartedHandState;
    }
  | {
      readonly type: 'runout';
      readonly hand: StartedHandState;
    };

function transitionAfterCompletedBetting(
  hand: StartedHandState,
): CompletedBettingTransition {
  if (!isBettingRoundComplete(hand.betting)) {
    throw new RangeError('Betting round is not complete');
  }
  const contenders = hand.players.filter(isContender);
  if (contenders.length === 1) {
    return { type: 'settle-uncontested', hand };
  }
  if (contenders.length < 2) {
    throw new RangeError('A completed betting round has no contenders');
  }
  if (hand.street === 'river') {
    return { type: 'settle-showdown', hand };
  }
  if (!hasFurtherBettingCompetition(hand.players)) {
    return { type: 'runout', hand };
  }
  const progressed = advanceAfterCompletedBetting(hand);
  return { type: 'continue', hand: progressed };
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

function toRecordedAction(command: BettingCommand): RecordedPlayerAction {
  switch (command.type) {
    case 'game.fold':
      return 'fold';
    case 'game.check':
      return 'check';
    case 'game.call':
      return 'call';
    case 'game.raise-to':
      return 'raiseTo';
    case 'game.all-in':
      return 'allIn';
  }
}

export class GameCommandHandler {
  constructor(
    private readonly rooms: RoomRepository,
    private readonly runtime: RoomCommandHandler,
    private readonly nowMs: () => number = Date.now,
    private readonly hooks: GameCommandHandlerHooks = {},
  ) {}

  automaticRunoutDelayMs(room: RoomState): number | null {
    if (room.phase !== 'playing') return null;
    const hand = this.runtime.getCurrentHand(room.roomId);
    if (
      !hand ||
      hand.betting.currentActorId !== null ||
      !isBettingRoundComplete(hand.betting) ||
      hand.players.filter(isContender).length < 2 ||
      hasFurtherBettingCompetition(hand.players)
    ) {
      return null;
    }
    return hand.street === 'river' ? 1_000 : 2_000;
  }

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
      action: toRecordedAction(command),
      street: hand.street,
    } satisfies PlayerActionEvent);
    if (isBettingRoundComplete(nextHand.betting)) {
      const transition = transitionAfterCompletedBetting(nextHand);
      if (transition.type === 'settle-uncontested') {
        return this.settle(
          transition.hand,
          room,
          settleUncontestedHand(transition.hand),
        );
      }
      if (transition.type === 'settle-showdown') {
        return this.settle(
          transition.hand,
          room,
          settleShowdown(transition.hand),
        );
      }
      if (transition.type === 'runout') {
        return this.savePlayingHand(room, transition.hand);
      }
      nextHand = transition.hand;
    }
    return this.savePlayingHand(room, nextHand);
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
    const transition = transitionAfterCompletedBetting(hand);
    if (transition.type === 'settle-uncontested') {
      return this.settle(
        transition.hand,
        room,
        settleUncontestedHand(transition.hand),
      );
    }
    if (transition.type === 'settle-showdown') {
      return this.settle(
        transition.hand,
        room,
        settleShowdown(transition.hand),
      );
    }
    if (transition.type === 'runout') {
      return this.savePlayingHand(room, advanceRunoutStreet(transition.hand));
    }
    return null;
  }

  private savePlayingHand(
    room: RoomState,
    hand: StartedHandState,
  ): CommandHandlerResult {
    this.runtime.replaceCurrentHand(room.roomId, hand);
    const nextRoom = syncLiveChipBalances(
      freezeRoom({ ...room, version: room.version + 1 }),
      hand,
    );
    this.rooms.save(nextRoom);
    return { stateVersion: nextRoom.version, sequence: 0 };
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
