import type { BettingAction } from '../betting/betting-round.js';
import { applyHandAction } from './hand-reducer.js';
import type { StartedHandState } from './start-hand.js';

export function applyPreflopAction(
  state: StartedHandState,
  playerId: string,
  action: BettingAction,
): StartedHandState {
  if (state.street !== 'preflop') {
    throw new RangeError('Hand is not on the preflop street');
  }
  return applyHandAction(state, playerId, action);
}
