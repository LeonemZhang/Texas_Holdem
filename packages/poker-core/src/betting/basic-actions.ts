import {
  freezeBettingState,
  pendingClockwiseAfter,
  requireCurrentActor,
  type BettingPlayerStatus,
  type BettingRoundState,
} from './state.js';

export type BasicBettingAction =
  | { readonly type: 'fold' }
  | { readonly type: 'check' }
  | { readonly type: 'call' };

export function applyBasicBettingAction(
  state: BettingRoundState,
  playerId: string,
  action: BasicBettingAction,
): BettingRoundState {
  const actor = requireCurrentActor(state, playerId);
  const owed = state.currentBet - actor.streetCommitted;
  let paid = 0;
  let status: BettingPlayerStatus = actor.status;

  if (action.type === 'fold') {
    status = 'folded';
  } else if (action.type === 'check') {
    if (owed !== 0) throw new RangeError('Cannot check while facing a bet');
  } else {
    if (owed <= 0) throw new RangeError('There is no bet to call');
    if (actor.stack < owed)
      throw new RangeError('Insufficient stack for a full call');
    paid = owed;
    if (paid === actor.stack) status = 'all-in';
  }

  const players = state.players.map((player) =>
    player.playerId === playerId
      ? {
          ...player,
          stack: player.stack - paid,
          streetCommitted: player.streetCommitted + paid,
          totalCommitted: player.totalCommitted + paid,
          status,
          actedAtBet: state.currentBet,
        }
      : player,
  );
  const pending = new Set(
    state.pendingPlayerIds.filter((id) => id !== playerId),
  );
  const orderedPending = pendingClockwiseAfter(players, pending, playerId);
  return freezeBettingState({
    ...state,
    players,
    currentActorId: orderedPending[0] ?? null,
    pendingPlayerIds: orderedPending,
  });
}
