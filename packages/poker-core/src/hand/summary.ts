import { formatCard, type CardCode } from '../cards/card.js';
import type { ShowdownSettledHand } from './showdown.js';
import type { UncontestedSettledHand } from './uncontested.js';

export interface HandSummaryParticipant {
  readonly playerId: string;
  readonly seatIndex: number;
}

export interface HandSummaryPot {
  readonly amount: number;
  readonly winnerIds: readonly string[];
}

export interface HandSummaryEvent {
  readonly type: 'hand.summary';
  readonly handId: string;
  readonly reason: 'uncontested' | 'showdown';
  readonly buttonIndex: number;
  readonly participants: readonly HandSummaryParticipant[];
  readonly communityCards: readonly CardCode[];
  readonly investments: Readonly<Record<string, number>>;
  readonly pots: readonly HandSummaryPot[];
  readonly winnerIds: readonly string[];
  readonly payouts: Readonly<Record<string, number>>;
  readonly netChanges: Readonly<Record<string, number>>;
  readonly revealedHoleCards: Readonly<Record<string, readonly CardCode[]>>;
}

export function createHandSummary(
  hand: UncontestedSettledHand | ShowdownSettledHand,
): HandSummaryEvent {
  const settlement = hand.settlement;
  const investments: Record<string, number> = {};
  const netChanges: Record<string, number> = {};
  for (const player of hand.players) {
    investments[player.playerId] = player.totalCommitted;
    netChanges[player.playerId] =
      (settlement.payouts[player.playerId] ?? 0) - player.totalCommitted;
  }
  const revealedHoleCards = Object.freeze(
    Object.fromEntries(
      Object.entries(settlement.revealedHoleCards).map(([playerId, cards]) => [
        playerId,
        Object.freeze(cards.map(formatCard)),
      ]),
    ),
  );
  const pots =
    settlement.reason === 'showdown'
      ? settlement.pots.map((pot, index) =>
          Object.freeze({
            amount: pot.amount,
            winnerIds: settlement.awards[index]?.winnerIds ?? [],
          }),
        )
      : [
          Object.freeze({
            amount: Object.values(settlement.payouts).reduce(
              (sum, amount) => sum + amount,
              0,
            ),
            winnerIds: settlement.winnerIds,
          }),
        ];

  return Object.freeze({
    type: 'hand.summary' as const,
    handId: hand.handId,
    reason: settlement.reason,
    buttonIndex: hand.positions.button.index,
    participants: Object.freeze(
      hand.players.map(({ playerId, seatIndex }) =>
        Object.freeze({ playerId, seatIndex }),
      ),
    ),
    communityCards: Object.freeze(hand.communityCards.map(formatCard)),
    investments: Object.freeze(investments),
    pots: Object.freeze(pots),
    winnerIds: settlement.winnerIds,
    payouts: settlement.payouts,
    netChanges: Object.freeze(netChanges),
    revealedHoleCards,
  });
}
