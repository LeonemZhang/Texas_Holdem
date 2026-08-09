import { isBettingRoundComplete } from '../betting/betting-round.js';
import {
  createBettingRound,
  freezeBettingState,
  isContender,
  type BettingPlayer,
} from '../betting/state.js';
import { actionOrderForStreet } from '../seating/positions.js';
import type { Seat } from '../seating/seats.js';
import type {
  HandStreet,
  StartedHandState,
  StreetPotAmount,
} from './start-hand.js';

function streetPotAmount(state: StartedHandState): number {
  return state.players.reduce(
    (total, player) => total + player.streetCommitted,
    0,
  );
}

type BettingCompetitionPlayer = Pick<BettingPlayer, 'status' | 'stack'>;

/**
 * Returns whether at least two players can still put chips into a future
 * betting decision. Callers must first establish that the current street is
 * closed; this function intentionally does not inspect betting-round
 * pending state.
 */
export function hasFurtherBettingCompetition(
  players: readonly BettingCompetitionPlayer[],
): boolean {
  return (
    players.filter(isContender).filter(({ stack }) => stack > 0).length >= 2
  );
}

function completedStreetPots(
  state: StartedHandState,
): readonly StreetPotAmount[] {
  // Saved games created before the history field existed remain playable.
  const existing = state.completedStreetPots ?? [];
  return Object.freeze([
    ...existing,
    Object.freeze({ street: state.street, amount: streetPotAmount(state) }),
  ]);
}

function dealStreet(
  state: StartedHandState,
  street: Exclude<HandStreet, 'preflop'>,
  closeBettingRound = false,
): StartedHandState {
  const cardCount = street === 'flop' ? 3 : 1;
  const dealt = state.deck.slice(
    state.deckCursor,
    state.deckCursor + cardCount,
  );
  if (dealt.length !== cardCount) {
    throw new RangeError(`Deck ended while dealing the ${street}`);
  }
  const players = state.players.map((player) =>
    Object.freeze({ ...player, streetCommitted: 0, lastAction: null }),
  );
  const seats: readonly Seat[] = players.map((player) => ({
    index: player.seatIndex,
    playerId: player.playerId,
    status: player.status === 'active' ? 'active' : 'sitting-out',
  }));
  const firstActor = actionOrderForStreet(seats, state.positions, street)[0];
  const betting = createBettingRound(
    players.map(
      ({ holeCards: _holeCards, seatIndex: _seatIndex, ...player }) => player,
    ),
    state.bigBlind,
    firstActor?.playerId,
  );
  const nextBetting = closeBettingRound
    ? freezeBettingState({
        ...betting,
        currentActorId: null,
        pendingPlayerIds: [],
      })
    : betting;
  return Object.freeze({
    ...state,
    street,
    players: Object.freeze(players),
    communityCards: Object.freeze([...state.communityCards, ...dealt]),
    deckCursor: state.deckCursor + cardCount,
    completedStreetPots: completedStreetPots(state),
    betting: nextBetting,
  });
}

function runoutToRiver(state: StartedHandState): StartedHandState {
  let next = state;
  while (next.street !== 'river') {
    const nextStreet =
      next.street === 'preflop'
        ? 'flop'
        : next.street === 'flop'
          ? 'turn'
          : 'river';
    next = dealStreet(next, nextStreet, true);
  }
  return next;
}

export function advanceToFlop(state: StartedHandState): StartedHandState {
  if (state.street !== 'preflop') {
    throw new RangeError(
      'Only a completed preflop round can advance to the flop',
    );
  }
  if (!isBettingRoundComplete(state.betting)) {
    throw new RangeError('Betting round is not complete');
  }
  if (state.players.filter(isContender).length <= 1) {
    throw new RangeError(
      'An uncontested hand must settle without dealing the flop',
    );
  }
  return dealStreet(state, 'flop');
}

export function advanceAfterCompletedBetting(
  state: StartedHandState,
): StartedHandState {
  if (!isBettingRoundComplete(state.betting)) {
    throw new RangeError('Betting round is not complete');
  }
  if (state.street === 'river') {
    throw new RangeError(
      'River betting advances to settlement, not another street',
    );
  }
  if (state.players.filter(isContender).length <= 1) {
    throw new RangeError(
      'An uncontested hand must settle without advancing the street',
    );
  }
  if (!hasFurtherBettingCompetition(state.players)) {
    return runoutToRiver(state);
  }
  const nextStreet =
    state.street === 'preflop'
      ? 'flop'
      : state.street === 'flop'
        ? 'turn'
        : 'river';
  return dealStreet(state, nextStreet);
}
