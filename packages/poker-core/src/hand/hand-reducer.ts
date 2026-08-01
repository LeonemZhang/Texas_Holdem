import {
  applyBettingAction,
  type BettingAction,
} from '../betting/betting-round.js';
import type { StartedHandState } from './start-hand.js';

export function applyHandAction(
  state: StartedHandState,
  playerId: string,
  action: BettingAction,
): StartedHandState {
  const betting = applyBettingAction(state.betting, playerId, action);
  const players = state.players.map((player) => {
    const bettingPlayer = betting.players.find(
      (candidate) => candidate.playerId === player.playerId,
    );
    if (!bettingPlayer) {
      throw new RangeError(`Missing betting player: ${player.playerId}`);
    }
    return Object.freeze({
      ...player,
      stack: bettingPlayer.stack,
      streetCommitted: bettingPlayer.streetCommitted,
      totalCommitted: bettingPlayer.totalCommitted,
      status: bettingPlayer.status,
    });
  });
  return Object.freeze({
    ...state,
    players: Object.freeze(players),
    betting,
  });
}
