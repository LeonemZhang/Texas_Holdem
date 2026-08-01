import { isBettingRoundComplete } from '../betting/betting-round.js';
import { createBettingRound } from '../betting/state.js';
import { actionOrderForStreet } from '../seating/positions.js';
import type { Seat } from '../seating/seats.js';
import type { StartedHandState } from './start-hand.js';

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

  const communityCards = state.deck.slice(
    state.deckCursor,
    state.deckCursor + 3,
  );
  if (communityCards.length !== 3) {
    throw new RangeError('Deck ended while dealing the flop');
  }
  const players = state.players.map((player) =>
    Object.freeze({ ...player, streetCommitted: 0 }),
  );
  const seats: readonly Seat[] = players.map((player) => ({
    index: player.seatIndex,
    playerId: player.playerId,
    status: player.status === 'active' ? 'active' : 'sitting-out',
  }));
  const firstActor = actionOrderForStreet(seats, state.positions, 'flop')[0];
  const betting = createBettingRound(
    players.map(
      ({ holeCards: _holeCards, seatIndex: _seatIndex, ...player }) => player,
    ),
    state.bigBlind,
    firstActor?.playerId,
  );

  return Object.freeze({
    ...state,
    street: 'flop',
    players: Object.freeze(players),
    communityCards: Object.freeze(communityCards),
    deckCursor: state.deckCursor + 3,
    betting,
  });
}
