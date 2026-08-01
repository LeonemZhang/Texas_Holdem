import { describe, expect, it } from 'vitest';

import { parseCard } from '../cards/card.js';
import type { BettingRoundState } from '../betting/state.js';
import {
  startHand,
  type HandPlayerState,
  type StartedHandState,
} from './start-hand.js';
import { settleShowdown } from './showdown.js';

interface FixturePlayer {
  readonly playerId: string;
  readonly totalCommitted: number;
  readonly folded?: boolean;
  readonly holeCards: readonly [string, string];
}

function fixture(
  inputs: readonly FixturePlayer[],
  community: readonly [string, string, string, string, string],
): StartedHandState {
  const started = startHand({
    handId: 'showdown',
    participants: inputs.map((input, index) => ({
      playerId: input.playerId,
      seatIndex: index * 3,
      stack: 1_000,
    })),
    previousButtonIndex: null,
    smallBlind: 1,
    randomSource: { next: () => 0 },
  });
  const players: readonly HandPlayerState[] = inputs.map((input, index) =>
    Object.freeze({
      playerId: input.playerId,
      seatIndex: index * 3,
      stack: 1_000 - input.totalCommitted,
      streetCommitted: 0,
      totalCommitted: input.totalCommitted,
      status: input.folded ? ('folded' as const) : ('all-in' as const),
      holeCards: Object.freeze(input.holeCards.map(parseCard)) as readonly [
        ReturnType<typeof parseCard>,
        ReturnType<typeof parseCard>,
      ],
    }),
  );
  const betting: BettingRoundState = Object.freeze({
    players: Object.freeze(
      players.map(({ holeCards: _cards, seatIndex: _seat, ...player }) =>
        Object.freeze({ ...player, actedAtBet: 0 }),
      ),
    ),
    currentBet: 0,
    minimumRaiseIncrement: 2,
    currentActorId: null,
    pendingPlayerIds: Object.freeze([]),
  });
  return Object.freeze({
    ...started,
    street: 'river',
    players,
    communityCards: Object.freeze(community.map(parseCard)),
    betting,
  });
}

describe('settleShowdown', () => {
  it('settles main and side pots against their independent eligibility', () => {
    const hand = fixture(
      [
        { playerId: 'a', totalCommitted: 100, holeCards: ['2c', '7d'] },
        { playerId: 'b', totalCommitted: 50, holeCards: ['As', 'Ad'] },
        {
          playerId: 'c',
          totalCommitted: 100,
          folded: true,
          holeCards: ['Kh', 'Kd'],
        },
      ],
      ['3c', '4d', '8h', '9s', 'Jc'],
    );
    const settled = settleShowdown(hand);
    expect(settled.settlement.payouts).toEqual({ b: 150, a: 100 });
    expect(settled.settlement.pots.map(({ amount }) => amount)).toEqual([
      150, 100,
    ]);
    expect(settled.settlement.bestHands.b?.cards).toHaveLength(5);
  });

  it('explains a board tie and awards its odd chip left of the button', () => {
    const hand = fixture(
      [
        { playerId: 'a', totalCommitted: 1, holeCards: ['2c', '4d'] },
        { playerId: 'b', totalCommitted: 1, holeCards: ['2h', '4s'] },
        {
          playerId: 'c',
          totalCommitted: 1,
          folded: true,
          holeCards: ['6c', '7d'],
        },
      ],
      ['As', 'Kd', 'Qh', 'Jc', 'Ts'],
    );
    const settled = settleShowdown(hand);
    expect(settled.settlement.payouts).toEqual({ a: 1, b: 2 });
    expect(settled.settlement.awards[0]?.oddChipWinnerIds).toEqual(['b']);
    expect(settled.settlement.bestHands.a?.rank).toEqual(
      settled.settlement.bestHands.b?.rank,
    );
  });

  it('conserves all stacks and reveals only showdown contenders', () => {
    const hand = fixture(
      [
        { playerId: 'a', totalCommitted: 20, holeCards: ['Ac', 'Ad'] },
        { playerId: 'b', totalCommitted: 20, holeCards: ['Kc', 'Kd'] },
        {
          playerId: 'c',
          totalCommitted: 20,
          folded: true,
          holeCards: ['Qc', 'Qd'],
        },
      ],
      ['2s', '3h', '7c', '8d', '9s'],
    );
    const settled = settleShowdown(hand);
    expect(settled.players.reduce((sum, player) => sum + player.stack, 0)).toBe(
      3_000,
    );
    expect(Object.keys(settled.settlement.revealedHoleCards)).toEqual([
      'a',
      'b',
    ]);
  });
});
