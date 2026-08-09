import { describe, expect, it } from 'vitest';

import { createBettingRound, freezeBettingState } from '../betting/state.js';
import { applyHandAction } from './hand-reducer.js';
import { applyPreflopAction } from './preflop-reducer.js';
import {
  startHand,
  type HandStreet,
  type StartedHandState,
} from './start-hand.js';
import {
  advanceAfterCompletedBetting,
  advanceToFlop,
  hasFurtherBettingCompetition,
} from './streets.js';

function headsUp(stack = 100): StartedHandState {
  return startHand({
    handId: 'streets',
    participants: [
      { playerId: 'a', seatIndex: 0, stack },
      { playerId: 'b', seatIndex: 5, stack },
    ],
    previousButtonIndex: null,
    smallBlind: 1,
    randomSource: { next: () => 0 },
  });
}

function threeWay(): StartedHandState {
  return startHand({
    handId: 'three-way-streets',
    participants: [
      { playerId: 'a', seatIndex: 0, stack: 100 },
      { playerId: 'b', seatIndex: 1, stack: 500 },
      { playerId: 'c', seatIndex: 2, stack: 800 },
    ],
    previousButtonIndex: null,
    smallBlind: 1,
    randomSource: { next: () => 0 },
  });
}

function checkedStreet(hand: StartedHandState): StartedHandState {
  let next = applyHandAction(hand, 'b', { type: 'check' });
  next = applyHandAction(next, 'a', { type: 'check' });
  return next;
}

function completeCurrentBettingRound(hand: StartedHandState): StartedHandState {
  let next = hand;
  while (next.betting.currentActorId !== null) {
    const actorId = next.betting.currentActorId;
    const actor = next.betting.players.find(
      ({ playerId }) => playerId === actorId,
    )!;
    next = applyHandAction(
      next,
      actorId,
      actor.streetCommitted < next.betting.currentBet
        ? { type: 'call' }
        : { type: 'check' },
    );
  }
  return next;
}

function handAtStreet(
  playerCount: number,
  targetStreet: HandStreet,
): StartedHandState {
  let hand = startHand({
    handId: `${playerCount}-${targetStreet}`,
    participants: Array.from({ length: playerCount }, (_, index) => ({
      playerId: `p${index}`,
      seatIndex: index,
      stack: 1_000,
    })),
    previousButtonIndex: null,
    smallBlind: 1,
    randomSource: { next: () => 0 },
  });
  while (hand.street !== targetStreet) {
    hand = advanceAfterCompletedBetting(completeCurrentBettingRound(hand));
  }
  return hand;
}

function closeWithFundedCount(
  hand: StartedHandState,
  fundedCount: number,
): StartedHandState {
  const players = hand.players.map((player, index) =>
    Object.freeze({
      ...player,
      stack: index < fundedCount ? 100 : 0,
      status: index < fundedCount ? ('active' as const) : ('all-in' as const),
      streetCommitted: 0,
      lastAction: null,
    }),
  );
  const betting = createBettingRound(
    players.map(
      ({ holeCards: _holeCards, seatIndex: _seatIndex, ...player }) => player,
    ),
    hand.bigBlind,
  );
  return Object.freeze({
    ...hand,
    players: Object.freeze(players),
    betting: freezeBettingState({
      ...betting,
      currentActorId: null,
      pendingPlayerIds: [],
    }),
  });
}

const competitionCases = [2, 3, 4].flatMap((playerCount) =>
  (['preflop', 'flop', 'turn'] as const).flatMap((street) =>
    [0, 1, 2].map((fundedCount) => ({
      playerCount,
      street,
      fundedCount,
    })),
  ),
);

describe('turn and river progression', () => {
  it('deals exactly one turn and one river with postflop action order', () => {
    let hand = headsUp();
    hand = applyPreflopAction(hand, 'a', { type: 'call' });
    hand = applyPreflopAction(hand, 'b', { type: 'check' });
    hand = advanceToFlop(hand);
    expect(hand.betting.currentActorId).toBe('b');
    hand = advanceAfterCompletedBetting(checkedStreet(hand));
    expect(hand.street).toBe('turn');
    expect(hand.communityCards).toHaveLength(4);
    expect(hand.betting.currentActorId).toBe('b');
    expect(hand.completedStreetPots).toEqual([
      { street: 'preflop', amount: 4 },
      { street: 'flop', amount: 0 },
    ]);
    hand = advanceAfterCompletedBetting(checkedStreet(hand));
    expect(hand.street).toBe('river');
    expect(hand.communityCards).toHaveLength(5);
    expect(hand.completedStreetPots).toEqual([
      { street: 'preflop', amount: 4 },
      { street: 'flop', amount: 0 },
      { street: 'turn', amount: 0 },
    ]);
  });

  it('automatically runs all community cards when nobody can act', () => {
    let hand = headsUp(2);
    hand = applyPreflopAction(hand, 'a', { type: 'call' });
    expect(hand.betting.currentActorId).toBeNull();
    hand = advanceAfterCompletedBetting(hand);
    expect(hand.street).toBe('river');
    expect(hand.communityCards).toHaveLength(5);
    expect(hand.betting.currentActorId).toBeNull();
  });

  it('runs out when only one contender can still bet', () => {
    let hand = threeWay();
    hand = applyHandAction(hand, 'a', { type: 'allIn' });
    hand = applyHandAction(hand, 'b', { type: 'call' });
    hand = applyHandAction(hand, 'c', { type: 'fold' });

    expect(hasFurtherBettingCompetition(hand.players)).toBe(false);
    hand = advanceAfterCompletedBetting(hand);

    expect(hand.street).toBe('river');
    expect(hand.communityCards).toHaveLength(5);
    expect(hand.betting.currentActorId).toBeNull();
    expect(hand.betting.pendingPlayerIds).toEqual([]);
  });

  it('keeps a next-street betting round when two contenders can still bet', () => {
    let hand = threeWay();
    hand = applyHandAction(hand, 'a', { type: 'allIn' });
    hand = applyHandAction(hand, 'b', { type: 'call' });
    hand = applyHandAction(hand, 'c', { type: 'call' });

    expect(hasFurtherBettingCompetition(hand.players)).toBe(true);
    hand = advanceAfterCompletedBetting(hand);

    expect(hand.street).toBe('flop');
    expect(hand.communityCards).toHaveLength(3);
    expect(hand.betting.currentActorId).toBe('b');
  });

  it('runs from flop to river when only one player remains funded', () => {
    let hand = headsUp();
    hand = applyPreflopAction(hand, 'a', { type: 'call' });
    hand = applyPreflopAction(hand, 'b', { type: 'check' });
    hand = advanceToFlop(hand);
    hand = applyHandAction(hand, 'b', { type: 'allIn' });
    hand = applyHandAction(hand, 'a', { type: 'call' });

    hand = advanceAfterCompletedBetting(hand);

    expect(hand.street).toBe('river');
    expect(hand.communityCards).toHaveLength(5);
    expect(hand.betting.currentActorId).toBeNull();
  });

  it('runs from turn to river when only one player remains funded', () => {
    let hand = headsUp();
    hand = applyPreflopAction(hand, 'a', { type: 'call' });
    hand = applyPreflopAction(hand, 'b', { type: 'check' });
    hand = advanceToFlop(hand);
    hand = advanceAfterCompletedBetting(checkedStreet(hand));
    hand = applyHandAction(hand, 'b', { type: 'allIn' });
    hand = applyHandAction(hand, 'a', { type: 'call' });

    hand = advanceAfterCompletedBetting(hand);

    expect(hand.street).toBe('river');
    expect(hand.communityCards).toHaveLength(5);
    expect(hand.betting.currentActorId).toBeNull();
  });

  it('refuses to evaluate runout before the current betting round closes', () => {
    let hand = threeWay();
    hand = applyHandAction(hand, 'a', { type: 'allIn' });

    expect(() => advanceAfterCompletedBetting(hand)).toThrow(
      'Betting round is not complete',
    );
  });

  it.each(competitionCases)(
    'handles $playerCount players at $street with $fundedCount funded contenders',
    ({ playerCount, street, fundedCount }) => {
      const closed = closeWithFundedCount(
        handAtStreet(playerCount, street),
        fundedCount,
      );
      const next = advanceAfterCompletedBetting(closed);

      if (fundedCount <= 1) {
        expect(next.street).toBe('river');
        expect(next.betting.currentActorId).toBeNull();
      } else {
        const expectedStreet =
          street === 'preflop' ? 'flop' : street === 'flop' ? 'turn' : 'river';
        expect(next.street).toBe(expectedStreet);
        expect(next.betting.currentActorId).not.toBeNull();
      }
    },
  );
});
