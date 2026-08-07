import { describe, expect, it } from 'vitest';

import { parseCard } from '../cards/card.js';
import type { BettingRoundState } from '../betting/state.js';
import { applyHandAction } from './hand-reducer.js';
import {
  startHand,
  type HandPlayerState,
  type StartedHandState,
} from './start-hand.js';
import { advanceAfterCompletedBetting } from './streets.js';
import { settleShowdown } from './showdown.js';

interface FixturePlayer {
  readonly playerId: string;
  readonly totalCommitted: number;
  readonly initialStack?: number;
  readonly folded?: boolean;
  readonly status?: HandPlayerState['status'];
  readonly holeCards: readonly [string, string];
}

type FivePlayerId = 'a' | 'b' | 'c' | 'd' | 'e';

const fivePlayerHoleCards = [
  ['As', 'Ad'],
  ['Ks', 'Kd'],
  ['Qs', 'Qd'],
  ['Js', 'Jd'],
  ['Ts', 'Td'],
] as const;

const fivePlayerContestedPots: readonly {
  readonly amount: number;
  readonly eligiblePlayerIds: readonly FivePlayerId[];
}[] = [
  { amount: 500, eligiblePlayerIds: ['a', 'b', 'c', 'd', 'e'] },
  { amount: 400, eligiblePlayerIds: ['b', 'c', 'd', 'e'] },
  { amount: 300, eligiblePlayerIds: ['c', 'd', 'e'] },
  { amount: 200, eligiblePlayerIds: ['d', 'e'] },
];

function fivePlayerMultiStreetAllInHand(
  ranking: readonly FivePlayerId[],
): StartedHandState {
  let hand = startHand({
    handId: `five-player-${ranking[0]}`,
    participants: [
      { playerId: 'a', seatIndex: 0, stack: 100 },
      { playerId: 'b', seatIndex: 1, stack: 200 },
      { playerId: 'c', seatIndex: 2, stack: 300 },
      { playerId: 'd', seatIndex: 3, stack: 400 },
      { playerId: 'e', seatIndex: 4, stack: 500 },
    ],
    previousButtonIndex: null,
    smallBlind: 1,
    randomSource: { next: () => 0.5 },
  });

  while (hand.betting.currentActorId !== null) {
    const actor = hand.betting.currentActorId;
    hand = applyHandAction(
      hand,
      actor,
      actor === 'a' ? { type: 'allIn' } : { type: 'call' },
    );
  }
  hand = advanceAfterCompletedBetting(hand);

  while (hand.betting.currentActorId !== null) {
    const actor = hand.betting.currentActorId;
    hand = applyHandAction(
      hand,
      actor,
      actor === 'b'
        ? { type: 'allIn' }
        : hand.betting.currentBet > 0
          ? { type: 'call' }
          : { type: 'check' },
    );
  }
  hand = advanceAfterCompletedBetting(hand);

  while (hand.betting.currentActorId !== null) {
    const actor = hand.betting.currentActorId;
    hand = applyHandAction(
      hand,
      actor,
      actor === 'c'
        ? { type: 'allIn' }
        : hand.betting.currentBet > 0
          ? { type: 'call' }
          : { type: 'check' },
    );
  }
  hand = advanceAfterCompletedBetting(hand);

  let dAllIn = false;
  while (hand.betting.currentActorId !== null) {
    const actor = hand.betting.currentActorId;
    if (actor === 'd') dAllIn = true;
    hand = applyHandAction(
      hand,
      actor,
      actor === 'd' || (actor === 'e' && dAllIn)
        ? { type: 'allIn' }
        : { type: 'check' },
    );
  }
  while (hand.street !== 'river') {
    hand = advanceAfterCompletedBetting(hand);
  }

  const holeCardsByPlayer = Object.fromEntries(
    ranking.map((playerId, index) => [playerId, fivePlayerHoleCards[index]!]),
  ) as Readonly<Record<FivePlayerId, readonly [string, string]>>;
  return Object.freeze({
    ...hand,
    communityCards: Object.freeze(
      ['2c', '3d', '4h', '8s', '9c'].map(parseCard),
    ),
    players: Object.freeze(
      hand.players.map((player) =>
        Object.freeze({
          ...player,
          holeCards: Object.freeze(
            holeCardsByPlayer[player.playerId as FivePlayerId].map(parseCard),
          ) as readonly [
            ReturnType<typeof parseCard>,
            ReturnType<typeof parseCard>,
          ],
        }),
      ),
    ),
  });
}

function fixture(
  inputs: readonly FixturePlayer[],
  community: readonly [string, string, string, string, string],
): StartedHandState {
  const started = startHand({
    handId: 'showdown',
    participants: inputs.map((input, index) => ({
      playerId: input.playerId,
      seatIndex: index * 2,
      stack: input.initialStack ?? 1_000,
    })),
    previousButtonIndex: null,
    smallBlind: 1,
    randomSource: { next: () => 0 },
  });
  const players: readonly HandPlayerState[] = inputs.map((input, index) =>
    Object.freeze({
      playerId: input.playerId,
      seatIndex: index * 2,
      stack: (input.initialStack ?? 1_000) - input.totalCommitted,
      streetCommitted: 0,
      totalCommitted: input.totalCommitted,
      status: input.folded ? ('folded' as const) : (input.status ?? 'all-in'),
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

function expectFivePlayerPotWinner(
  ranking: readonly FivePlayerId[],
  potIndex: number,
  expectedPotWinner: FivePlayerId,
): void {
  const settled = settleShowdown(fivePlayerMultiStreetAllInHand(ranking));
  const expectedPayouts: Record<FivePlayerId, number> = {
    a: 0,
    b: 0,
    c: 0,
    d: 0,
    e: 100,
  };
  const expectedPotWinners = fivePlayerContestedPots.map(
    ({ amount, eligiblePlayerIds }) => {
      const winner = ranking.find((playerId) =>
        eligiblePlayerIds.includes(playerId),
      );
      if (!winner) throw new Error('Five-player pot has no ranked winner');
      expectedPayouts[winner] += amount;
      return [winner] as const;
    },
  );
  const expectedWinnerIds = [
    ...new Set(expectedPotWinners.flat()),
  ] as readonly FivePlayerId[];
  const expectedAwards = [...expectedPotWinners, []];

  expect(settled.settlement.pots.map(({ amount }) => amount)).toEqual([
    500, 400, 300, 200, 100,
  ]);
  expect(settled.settlement.awards.map(({ winnerIds }) => winnerIds)).toEqual(
    expectedAwards,
  );
  expect(settled.settlement.awards[potIndex]?.winnerIds).toEqual([
    expectedPotWinner,
  ]);
  expect(settled.settlement.awards[4]).toMatchObject({
    winnerIds: [],
    refundedPlayerId: 'e',
    equalShare: 100,
  });
  expect(settled.settlement.winnerIds).toEqual(expectedWinnerIds);
  expect(settled.settlement.payouts).toEqual(
    Object.fromEntries(
      Object.entries(expectedPayouts).filter(([, amount]) => amount > 0),
    ),
  );
  expect(
    settled.players.reduce((total, player) => total + player.stack, 0),
  ).toBe(1_500);
}

function expectFivePlayerUnmatchedReturn(): void {
  const settled = settleShowdown(
    fivePlayerMultiStreetAllInHand(['a', 'b', 'c', 'd', 'e']),
  );

  expect(settled.settlement.awards[4]).toMatchObject({
    winnerIds: [],
    refundedPlayerId: 'e',
    equalShare: 100,
  });
  expect(settled.settlement.payouts.e).toBe(100);
  expect(
    settled.players.reduce((total, player) => total + player.stack, 0),
  ).toBe(1_500);
}

function equalTwoLevelAllInHand(
  ranking: readonly FivePlayerId[],
): StartedHandState {
  return fixture(
    ranking.map((playerId, index) => ({
      playerId,
      totalCommitted: playerId === 'a' ? 100 : 200,
      initialStack: playerId === 'a' ? 100 : 200,
      holeCards: fivePlayerHoleCards[index]!,
    })),
    ['2c', '3d', '4h', '8s', '9c'],
  );
}

function expectEqualTwoLevelPayout(
  ranking: readonly FivePlayerId[],
  expectedPayouts: Readonly<Record<string, number>>,
  expectedWinnerIds: readonly FivePlayerId[],
): void {
  const settled = settleShowdown(equalTwoLevelAllInHand(ranking));
  expect(settled.settlement.pots.map(({ amount }) => amount)).toEqual([
    500, 400,
  ]);
  expect(settled.settlement.awards.map(({ winnerIds }) => winnerIds)).toEqual([
    [expectedWinnerIds[0]],
    [expectedWinnerIds[1]],
  ]);
  expect(settled.settlement.payouts).toEqual(expectedPayouts);
}

describe('settleShowdown', () => {
  it('returns an unmatched heads-up all-in and only credits the matched pot to the winner', () => {
    const hand = fixture(
      [
        {
          playerId: 'a',
          totalCommitted: 100,
          initialStack: 100,
          holeCards: ['As', 'Ad'],
        },
        {
          playerId: 'b',
          totalCommitted: 200,
          initialStack: 200,
          holeCards: ['2c', '7d'],
        },
      ],
      ['3c', '4d', '8h', '9s', 'Jc'],
    );

    const settled = settleShowdown(hand);

    expect(settled.settlement.pots.map(({ amount }) => amount)).toEqual([
      200, 100,
    ]);
    expect(settled.settlement.awards).toMatchObject([
      { winnerIds: ['a'], equalShare: 200 },
      { winnerIds: [], equalShare: 100, refundedPlayerId: 'b' },
    ]);
    expect(settled.settlement.winnerIds).toEqual(['a']);
    expect(settled.settlement.payouts).toEqual({ a: 200, b: 100 });
    expect(
      settled.players.map(({ playerId, stack }) => [playerId, stack]),
    ).toEqual([
      ['a', 200],
      ['b', 100],
    ]);
  });

  it('settles sequential all-ins across main, side, and unmatched layers', () => {
    let hand = startHand({
      handId: 'sequential-all-in',
      participants: [
        { playerId: 'a', seatIndex: 0, stack: 100 },
        { playerId: 'b', seatIndex: 3, stack: 200 },
        { playerId: 'c', seatIndex: 6, stack: 300 },
      ],
      previousButtonIndex: null,
      smallBlind: 1,
      randomSource: { next: () => 0.5 },
    });
    while (hand.betting.currentActorId !== null) {
      hand = applyHandAction(hand, hand.betting.currentActorId, {
        type: 'allIn',
      });
    }
    while (hand.street !== 'river') {
      hand = advanceAfterCompletedBetting(hand);
    }
    const holeCards = [
      ['As', 'Ad'],
      ['Ks', 'Kd'],
      ['2c', '7d'],
    ] as const;
    hand = Object.freeze({
      ...hand,
      communityCards: Object.freeze(
        ['3c', '4d', '8h', '9s', 'Jc'].map(parseCard),
      ),
      players: Object.freeze(
        hand.players.map((player, index) =>
          Object.freeze({
            ...player,
            holeCards: Object.freeze(
              holeCards[index]!.map(parseCard),
            ) as readonly [
              ReturnType<typeof parseCard>,
              ReturnType<typeof parseCard>,
            ],
          }),
        ),
      ),
    });

    const settled = settleShowdown(hand);

    expect(settled.settlement.pots.map(({ amount }) => amount)).toEqual([
      300, 200, 100,
    ]);
    expect(settled.settlement.payouts).toEqual({ a: 300, b: 200, c: 100 });
    expect(settled.settlement.winnerIds).toEqual(['a', 'b']);
    expect(
      settled.players.map(({ playerId, stack }) => [playerId, stack]),
    ).toEqual([
      ['a', 300],
      ['b', 200],
      ['c', 100],
    ]);
    expect(
      settled.players.reduce((total, player) => total + player.stack, 0),
    ).toBe(600);
  });

  it('accumulates multi-street contributions and refunds C uncalled 100', () => {
    let hand = startHand({
      handId: 'multi-street-all-in',
      participants: [
        { playerId: 'a', seatIndex: 0, stack: 100 },
        { playerId: 'b', seatIndex: 3, stack: 200 },
        { playerId: 'c', seatIndex: 6, stack: 300 },
      ],
      previousButtonIndex: null,
      smallBlind: 1,
      randomSource: { next: () => 0.5 },
    });

    hand = applyHandAction(hand, 'a', { type: 'allIn' });
    hand = applyHandAction(hand, 'b', { type: 'call' });
    hand = applyHandAction(hand, 'c', { type: 'call' });
    hand = advanceAfterCompletedBetting(hand);
    expect(hand.street).toBe('flop');
    expect(hand.completedStreetPots).toEqual([
      { street: 'preflop', amount: 300 },
    ]);

    hand = applyHandAction(hand, 'b', { type: 'allIn' });
    hand = applyHandAction(hand, 'c', { type: 'call' });
    hand = advanceAfterCompletedBetting(hand);
    expect(hand.street).toBe('turn');
    expect(hand.completedStreetPots).toEqual([
      { street: 'preflop', amount: 300 },
      { street: 'flop', amount: 200 },
    ]);

    hand = applyHandAction(hand, 'c', { type: 'allIn' });
    while (hand.street !== 'river') {
      hand = advanceAfterCompletedBetting(hand);
    }
    expect(hand.completedStreetPots).toEqual([
      { street: 'preflop', amount: 300 },
      { street: 'flop', amount: 200 },
      { street: 'turn', amount: 100 },
    ]);

    const holeCards = [
      ['As', 'Ad'],
      ['Ks', 'Kd'],
      ['2c', '7d'],
    ] as const;
    hand = Object.freeze({
      ...hand,
      communityCards: Object.freeze(
        ['3c', '4d', '8h', '9s', 'Jc'].map(parseCard),
      ),
      players: Object.freeze(
        hand.players.map((player, index) =>
          Object.freeze({
            ...player,
            holeCards: Object.freeze(
              holeCards[index]!.map(parseCard),
            ) as readonly [
              ReturnType<typeof parseCard>,
              ReturnType<typeof parseCard>,
            ],
          }),
        ),
      ),
    });

    const settled = settleShowdown(hand);

    expect(settled.settlement.pots.map(({ amount }) => amount)).toEqual([
      300, 200, 100,
    ]);
    expect(settled.settlement.awards[2]).toMatchObject({
      winnerIds: [],
      refundedPlayerId: 'c',
      equalShare: 100,
    });
    expect(settled.settlement.payouts).toEqual({ a: 300, b: 200, c: 100 });
    expect(
      settled.players.map(({ playerId, stack }) => [playerId, stack]),
    ).toEqual([
      ['a', 300],
      ['b', 200],
      ['c', 100],
    ]);
  });

  describe('A 层主池', () => {
    it('A 赢', () =>
      expectFivePlayerPotWinner(['a', 'b', 'c', 'd', 'e'], 0, 'a'));
    it('A 赢，牌力 A > B > D > E > C', () =>
      expectFivePlayerPotWinner(['a', 'b', 'd', 'e', 'c'], 0, 'a'));
    it('A 赢，牌力 A > C > B > E > D', () =>
      expectFivePlayerPotWinner(['a', 'c', 'b', 'e', 'd'], 0, 'a'));
    it('A 赢，牌力 A > D > E > C > B', () =>
      expectFivePlayerPotWinner(['a', 'd', 'e', 'c', 'b'], 0, 'a'));
    it('A 赢，牌力 A > E > D > C > B', () =>
      expectFivePlayerPotWinner(['a', 'e', 'd', 'c', 'b'], 0, 'a'));
    it('B 赢', () =>
      expectFivePlayerPotWinner(['b', 'a', 'c', 'd', 'e'], 0, 'b'));
    it('C 赢', () =>
      expectFivePlayerPotWinner(['c', 'a', 'b', 'd', 'e'], 0, 'c'));
    it('D 赢', () =>
      expectFivePlayerPotWinner(['d', 'a', 'b', 'c', 'e'], 0, 'd'));
    it('E 赢', () =>
      expectFivePlayerPotWinner(['e', 'a', 'b', 'c', 'd'], 0, 'e'));
  });

  describe('B 层边池', () => {
    it('B 赢', () =>
      expectFivePlayerPotWinner(['a', 'b', 'c', 'd', 'e'], 1, 'b'));
    it('C 赢', () =>
      expectFivePlayerPotWinner(['a', 'c', 'b', 'd', 'e'], 1, 'c'));
    it('D 赢', () =>
      expectFivePlayerPotWinner(['a', 'd', 'b', 'c', 'e'], 1, 'd'));
    it('E 赢', () =>
      expectFivePlayerPotWinner(['a', 'e', 'b', 'c', 'd'], 1, 'e'));
  });

  describe('C 层边池', () => {
    it('C 赢', () =>
      expectFivePlayerPotWinner(['a', 'b', 'c', 'd', 'e'], 2, 'c'));
    it('D 赢', () =>
      expectFivePlayerPotWinner(['a', 'b', 'd', 'c', 'e'], 2, 'd'));
    it('E 赢', () =>
      expectFivePlayerPotWinner(['a', 'b', 'e', 'c', 'd'], 2, 'e'));
  });

  describe('D 层边池', () => {
    it('D 赢', () =>
      expectFivePlayerPotWinner(['a', 'b', 'c', 'd', 'e'], 3, 'd'));
    it('E 赢', () =>
      expectFivePlayerPotWinner(['a', 'b', 'c', 'e', 'd'], 3, 'e'));
  });

  describe('E 未匹配层', () => {
    it('E 返还', () => expectFivePlayerUnmatchedReturn());
  });

  describe('结算边界', () => {
    const board = ['2c', '3d', '4h', '8s', '9c'] as const;

    it('平局分池：A = B > C > D > E', () => {
      const settled = settleShowdown(
        fixture(
          [
            {
              playerId: 'a',
              totalCommitted: 100,
              initialStack: 100,
              holeCards: ['As', 'Ad'],
            },
            {
              playerId: 'b',
              totalCommitted: 100,
              initialStack: 100,
              holeCards: ['Ah', 'Ac'],
            },
            {
              playerId: 'c',
              totalCommitted: 100,
              initialStack: 100,
              holeCards: ['Ks', 'Kd'],
            },
            {
              playerId: 'd',
              totalCommitted: 100,
              initialStack: 100,
              holeCards: ['Qs', 'Qd'],
            },
            {
              playerId: 'e',
              totalCommitted: 100,
              initialStack: 100,
              holeCards: ['Js', 'Jd'],
            },
          ],
          board,
        ),
      );
      expect(settled.settlement.pots.map(({ amount }) => amount)).toEqual([
        500,
      ]);
      expect(settled.settlement.awards[0]).toMatchObject({
        winnerIds: ['a', 'b'],
        equalShare: 250,
      });
      expect(settled.settlement.payouts).toEqual({ a: 250, b: 250 });
    });

    it('边池平局：A > C = D > B > E', () => {
      const settled = settleShowdown(
        fixture(
          [
            {
              playerId: 'a',
              totalCommitted: 100,
              initialStack: 100,
              holeCards: ['As', 'Ad'],
            },
            {
              playerId: 'b',
              totalCommitted: 200,
              initialStack: 200,
              holeCards: ['Qs', 'Qd'],
            },
            {
              playerId: 'c',
              totalCommitted: 300,
              initialStack: 300,
              holeCards: ['Ks', 'Kd'],
            },
            {
              playerId: 'd',
              totalCommitted: 400,
              initialStack: 400,
              holeCards: ['Kh', 'Kc'],
            },
            {
              playerId: 'e',
              totalCommitted: 500,
              initialStack: 500,
              holeCards: ['Js', 'Jd'],
            },
          ],
          board,
        ),
      );
      expect(settled.settlement.payouts).toEqual({
        a: 500,
        c: 350,
        d: 550,
        e: 100,
      });
      expect(
        settled.settlement.awards.map(({ winnerIds }) => winnerIds),
      ).toEqual([['a'], ['c', 'd'], ['c', 'd'], ['d'], []]);
    });

    it('不能整除的501底池：odd chip给按钮左侧的B', () => {
      const settled = settleShowdown(
        fixture(
          [
            {
              playerId: 'a',
              totalCommitted: 250,
              initialStack: 250,
              holeCards: ['As', 'Ad'],
            },
            {
              playerId: 'b',
              totalCommitted: 250,
              initialStack: 250,
              holeCards: ['Ah', 'Ac'],
            },
            {
              playerId: 'c',
              totalCommitted: 1,
              initialStack: 1,
              folded: true,
              holeCards: ['Ks', 'Kd'],
            },
          ],
          board,
        ),
      );
      expect(settled.settlement.pots.map(({ amount }) => amount)).toEqual([
        3, 498,
      ]);
      expect(settled.settlement.payouts).toEqual({ a: 250, b: 251 });
      expect(settled.settlement.awards[0]?.oddChipWinnerIds).toEqual(['b']);
    });

    it('弃牌玩家有投入：B投入200后fold', () => {
      const settled = settleShowdown(
        fixture(
          [
            {
              playerId: 'a',
              totalCommitted: 100,
              initialStack: 100,
              holeCards: ['As', 'Ad'],
            },
            {
              playerId: 'b',
              totalCommitted: 200,
              initialStack: 200,
              folded: true,
              holeCards: ['Ks', 'Kd'],
            },
            {
              playerId: 'c',
              totalCommitted: 200,
              initialStack: 200,
              holeCards: ['Qs', 'Qd'],
            },
          ],
          board,
        ),
      );
      expect(settled.settlement.pots.map(({ amount }) => amount)).toEqual([
        300, 200,
      ]);
      expect(settled.settlement.payouts).toEqual({ a: 300, c: 200 });
      expect(settled.settlement.winnerIds).not.toContain('b');
    });

    it('大筹码玩家弃牌：E投入500后fold，未匹配的100仍返还', () => {
      const settled = settleShowdown(
        fixture(
          [
            {
              playerId: 'a',
              totalCommitted: 100,
              initialStack: 100,
              holeCards: ['As', 'Ad'],
            },
            {
              playerId: 'b',
              totalCommitted: 200,
              initialStack: 200,
              holeCards: ['Ks', 'Kd'],
            },
            {
              playerId: 'c',
              totalCommitted: 300,
              initialStack: 300,
              holeCards: ['Qs', 'Qd'],
            },
            {
              playerId: 'd',
              totalCommitted: 400,
              initialStack: 400,
              holeCards: ['Js', 'Jd'],
            },
            {
              playerId: 'e',
              totalCommitted: 500,
              initialStack: 500,
              folded: true,
              holeCards: ['Ts', 'Td'],
            },
          ],
          board,
        ),
      );
      expect(settled.settlement.pots.map(({ amount }) => amount)).toEqual([
        500, 400, 300, 200, 100,
      ]);
      expect(settled.settlement.payouts).toEqual({
        a: 500,
        b: 400,
        c: 300,
        d: 200,
        e: 100,
      });
      expect(settled.settlement.awards[4]).toMatchObject({
        winnerIds: [],
        refundedPlayerId: 'e',
        equalShare: 100,
      });
      expect(
        settled.settlement.awards.flatMap(({ winnerIds }) => winnerIds),
      ).not.toContain('e');
      expect(
        Object.values(settled.settlement.payouts).reduce(
          (total, amount) => total + amount,
          0,
        ),
      ).toBe(1_500);
    });

    it('相同All-in金额：A100/B100/C300不生成0金额边池', () => {
      const settled = settleShowdown(
        fixture(
          [
            {
              playerId: 'a',
              totalCommitted: 100,
              initialStack: 100,
              holeCards: ['As', 'Ad'],
            },
            {
              playerId: 'b',
              totalCommitted: 100,
              initialStack: 100,
              holeCards: ['Ks', 'Kd'],
            },
            {
              playerId: 'c',
              totalCommitted: 300,
              initialStack: 300,
              holeCards: ['Qs', 'Qd'],
            },
          ],
          board,
        ),
      );
      expect(settled.settlement.pots.map(({ amount }) => amount)).toEqual([
        300, 200,
      ]);
      expect(settled.settlement.pots.every(({ amount }) => amount > 0)).toBe(
        true,
      );
      expect(settled.settlement.payouts).toEqual({ a: 300, c: 200 });
    });

    it('多人同金额：A100/B200/C200/D500', () => {
      const settled = settleShowdown(
        fixture(
          [
            {
              playerId: 'a',
              totalCommitted: 100,
              initialStack: 100,
              holeCards: ['As', 'Ad'],
            },
            {
              playerId: 'b',
              totalCommitted: 200,
              initialStack: 200,
              holeCards: ['Ks', 'Kd'],
            },
            {
              playerId: 'c',
              totalCommitted: 200,
              initialStack: 200,
              holeCards: ['Qs', 'Qd'],
            },
            {
              playerId: 'd',
              totalCommitted: 500,
              initialStack: 500,
              holeCards: ['Js', 'Jd'],
            },
          ],
          board,
        ),
      );
      expect(settled.settlement.pots.map(({ amount }) => amount)).toEqual([
        400, 300, 300,
      ]);
      expect(settled.settlement.payouts).toEqual({ a: 400, b: 300, d: 300 });
    });

    it('只有1人覆盖All-in：A100/B500，B多出的400退回', () => {
      const settled = settleShowdown(
        fixture(
          [
            {
              playerId: 'a',
              totalCommitted: 100,
              initialStack: 100,
              holeCards: ['As', 'Ad'],
            },
            {
              playerId: 'b',
              totalCommitted: 500,
              initialStack: 500,
              holeCards: ['Ks', 'Kd'],
            },
          ],
          board,
        ),
      );
      expect(settled.settlement.pots.map(({ amount }) => amount)).toEqual([
        200, 400,
      ]);
      expect(settled.settlement.payouts).toEqual({ a: 200, b: 400 });
      expect(settled.settlement.awards[1]).toMatchObject({
        refundedPlayerId: 'b',
        equalShare: 400,
      });
    });

    it('非All-in玩家下注覆盖：A100 all-in，B/C各投入500', () => {
      const settled = settleShowdown(
        fixture(
          [
            {
              playerId: 'a',
              totalCommitted: 100,
              initialStack: 100,
              holeCards: ['As', 'Ad'],
            },
            {
              playerId: 'b',
              totalCommitted: 500,
              initialStack: 600,
              status: 'active',
              holeCards: ['Ks', 'Kd'],
            },
            {
              playerId: 'c',
              totalCommitted: 500,
              initialStack: 600,
              status: 'active',
              holeCards: ['Qs', 'Qd'],
            },
          ],
          board,
        ),
      );
      expect(settled.settlement.pots.map(({ amount }) => amount)).toEqual([
        300, 800,
      ]);
      expect(settled.settlement.payouts).toEqual({ a: 300, b: 800 });
      expect(
        settled.players.map(({ playerId, stack }) => [playerId, stack]),
      ).toEqual([
        ['a', 300],
        ['b', 900],
        ['c', 100],
      ]);
    });

    it('All-in后继续加注：A100/B200/C500/D500形成多级边池', () => {
      const settled = settleShowdown(
        fixture(
          [
            {
              playerId: 'a',
              totalCommitted: 100,
              initialStack: 100,
              holeCards: ['As', 'Ad'],
            },
            {
              playerId: 'b',
              totalCommitted: 200,
              initialStack: 200,
              holeCards: ['Ks', 'Kd'],
            },
            {
              playerId: 'c',
              totalCommitted: 500,
              initialStack: 500,
              holeCards: ['Qs', 'Qd'],
            },
            {
              playerId: 'd',
              totalCommitted: 500,
              initialStack: 500,
              holeCards: ['Js', 'Jd'],
            },
          ],
          board,
        ),
      );
      expect(settled.settlement.pots.map(({ amount }) => amount)).toEqual([
        400, 300, 600,
      ]);
      expect(settled.settlement.payouts).toEqual({ a: 400, b: 300, c: 600 });
    });

    it('多名平局跨多个池：A = C > D > B > E', () => {
      const settled = settleShowdown(
        fixture(
          [
            {
              playerId: 'a',
              totalCommitted: 100,
              initialStack: 100,
              holeCards: ['As', 'Ad'],
            },
            {
              playerId: 'b',
              totalCommitted: 200,
              initialStack: 200,
              holeCards: ['Qs', 'Qd'],
            },
            {
              playerId: 'c',
              totalCommitted: 300,
              initialStack: 300,
              holeCards: ['Ah', 'Ac'],
            },
            {
              playerId: 'd',
              totalCommitted: 400,
              initialStack: 400,
              holeCards: ['Ks', 'Kd'],
            },
            {
              playerId: 'e',
              totalCommitted: 500,
              initialStack: 500,
              holeCards: ['Js', 'Jd'],
            },
          ],
          board,
        ),
      );
      expect(
        settled.settlement.awards.map(({ winnerIds }) => winnerIds),
      ).toEqual([['a', 'c'], ['c'], ['c'], ['d'], []]);
      expect(settled.settlement.payouts).toEqual({
        a: 250,
        c: 950,
        d: 200,
        e: 100,
      });
    });
  });

  describe('两层投入独立结算：A100、B/C/D/E各200', () => {
    it('A最高：A>B>C>D>E', () =>
      expectEqualTwoLevelPayout(['a', 'b', 'c', 'd', 'e'], { a: 500, b: 400 }, [
        'a',
        'b',
      ]));
    it('B最高：B>A>C>D>E', () =>
      expectEqualTwoLevelPayout(['b', 'a', 'c', 'd', 'e'], { b: 900 }, [
        'b',
        'b',
      ]));
    it('C最高：C>A>B>D>E', () =>
      expectEqualTwoLevelPayout(['c', 'a', 'b', 'd', 'e'], { c: 900 }, [
        'c',
        'c',
      ]));
    it('D最高：D>A>B>C>E', () =>
      expectEqualTwoLevelPayout(['d', 'a', 'b', 'c', 'e'], { d: 900 }, [
        'd',
        'd',
      ]));
    it('E最高：E>A>B>C>D', () =>
      expectEqualTwoLevelPayout(['e', 'a', 'b', 'c', 'd'], { e: 900 }, [
        'e',
        'e',
      ]));
    it('A最高、C次高：A>C>B>D>E', () =>
      expectEqualTwoLevelPayout(['a', 'c', 'b', 'd', 'e'], { a: 500, c: 400 }, [
        'a',
        'c',
      ]));
    it('A最高、E次高：A>E>D>C>B', () =>
      expectEqualTwoLevelPayout(['a', 'e', 'd', 'c', 'b'], { a: 500, e: 400 }, [
        'a',
        'e',
      ]));
    it('A最低：B>C>D>E>A', () =>
      expectEqualTwoLevelPayout(['b', 'c', 'd', 'e', 'a'], { b: 900 }, [
        'b',
        'b',
      ]));

    it('B额外投入100无人匹配：A100、B200、C/D/E各100', () => {
      const settled = settleShowdown(
        fixture(
          [
            {
              playerId: 'a',
              totalCommitted: 100,
              initialStack: 100,
              holeCards: ['As', 'Ad'],
            },
            {
              playerId: 'b',
              totalCommitted: 200,
              initialStack: 200,
              holeCards: ['Ks', 'Kd'],
            },
            {
              playerId: 'c',
              totalCommitted: 100,
              initialStack: 100,
              holeCards: ['Qs', 'Qd'],
            },
            {
              playerId: 'd',
              totalCommitted: 100,
              initialStack: 100,
              holeCards: ['Js', 'Jd'],
            },
            {
              playerId: 'e',
              totalCommitted: 100,
              initialStack: 100,
              holeCards: ['Ts', 'Td'],
            },
          ],
          ['2c', '3d', '4h', '8s', '9c'],
        ),
      );
      expect(settled.settlement.pots.map(({ amount }) => amount)).toEqual([
        500, 100,
      ]);
      expect(settled.settlement.awards).toMatchObject([
        { winnerIds: ['a'], equalShare: 500 },
        { winnerIds: [], refundedPlayerId: 'b', equalShare: 100 },
      ]);
      expect(settled.settlement.payouts).toEqual({ a: 500, b: 100 });
    });
  });

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
