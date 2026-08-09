import { applyAllIn } from './all-in.js';
import {
  applyBasicBettingAction,
  type BasicBettingAction,
} from './basic-actions.js';
import { applyRaiseTo } from './raise.js';
import { isRaiseReopenedFor } from './reopen.js';
import { isContender, type BettingRoundState } from './state.js';

export type BettingAction =
  | BasicBettingAction
  | { readonly type: 'raiseTo'; readonly amount: number }
  | { readonly type: 'allIn' };

export interface LegalBettingActions {
  readonly canFold: boolean;
  readonly canCheck: boolean;
  readonly callAmount: number | null;
  readonly minimumRaiseTo: number | null;
  readonly maximumRaiseTo: number | null;
  readonly canAllIn: boolean;
}

const NO_ACTIONS: LegalBettingActions = Object.freeze({
  canFold: false,
  canCheck: false,
  callAmount: null,
  minimumRaiseTo: null,
  maximumRaiseTo: null,
  canAllIn: false,
});

export function applyBettingAction(
  state: BettingRoundState,
  playerId: string,
  action: BettingAction,
): BettingRoundState {
  if (action.type === 'raiseTo') {
    return applyRaiseTo(state, playerId, action.amount);
  }
  if (action.type === 'allIn') {
    return applyAllIn(state, playerId);
  }
  return applyBasicBettingAction(state, playerId, action);
}

export function legalBettingActions(
  state: BettingRoundState,
  playerId: string = state.currentActorId ?? '',
): LegalBettingActions {
  const player = state.players.find(
    (candidate) => candidate.playerId === playerId,
  );
  if (
    !player ||
    player.status !== 'active' ||
    state.currentActorId !== playerId
  ) {
    return NO_ACTIONS;
  }

  const owed = state.currentBet - player.streetCommitted;
  const maximum = player.streetCommitted + player.stack;
  const minimum = state.currentBet + state.minimumRaiseIncrement;
  const raiseReopened = isRaiseReopenedFor(state, player);
  const hasStandardRaise = raiseReopened && maximum >= minimum;
  const allInWouldRaise = maximum > state.currentBet;
  return Object.freeze({
    canFold: true,
    canCheck: owed === 0,
    callAmount: owed > 0 && player.stack >= owed ? owed : null,
    minimumRaiseTo: hasStandardRaise ? minimum : null,
    maximumRaiseTo: hasStandardRaise ? maximum : null,
    canAllIn:
      player.stack > 0 &&
      (!allInWouldRaise || isRaiseReopenedFor(state, player)),
  });
}

export function isBettingRoundComplete(state: BettingRoundState): boolean {
  const contenders = state.players.filter(isContender);
  if (contenders.length <= 1) return true;
  return (
    state.pendingPlayerIds.length === 0 &&
    state.players.every(
      (player) =>
        player.status !== 'active' ||
        player.streetCommitted === state.currentBet,
    )
  );
}
