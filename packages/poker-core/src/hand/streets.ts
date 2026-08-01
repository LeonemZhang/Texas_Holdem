import { isBettingRoundComplete } from '../betting/betting-round.js';
import { createBettingRound } from '../betting/state.js';
import { actionOrderForStreet } from '../seating/positions.js';
import type { Seat } from '../seating/seats.js';
import type { HandStreet, StartedHandState } from './start-hand.js';

function dealStreet(
  state: StartedHandState,
  street: Exclude<HandStreet, 'preflop'>,
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
    Object.freeze({ ...player, streetCommitted: 0 }),
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
  return Object.freeze({
    ...state,
    street,
    players: Object.freeze(players),
    communityCards: Object.freeze([...state.communityCards, ...dealt]),
    deckCursor: state.deckCursor + cardCount,
    betting,
  });
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
  if (state.players.filter(({ status }) => status !== 'folded').length <= 1) {
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
  const nextStreet =
    state.street === 'preflop'
      ? 'flop'
      : state.street === 'flop'
        ? 'turn'
        : 'river';
  const next = dealStreet(state, nextStreet);
  if (next.betting.currentActorId === null && next.street !== 'river') {
    return advanceAfterCompletedBetting(next);
  }
  return next;
}
