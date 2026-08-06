import { formatCard, type CardCode } from '../cards/card.js';
import { findBestFiveCardHand } from '../evaluator/best-hand.js';
import type { HandRank } from '../evaluator/hand-rank.js';
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

/** A server-evaluated five-card hand retained for aggregate statistics. */
export interface EvaluatedHandSummary {
  readonly rank: HandRank;
  readonly bestFiveCards: readonly CardCode[];
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
  /** Optional so summaries written before hand-peak tracking remain readable. */
  readonly evaluatedHands?: Readonly<Record<string, EvaluatedHandSummary>>;
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

  const evaluatedHands =
    settlement.reason === 'showdown'
      ? Object.freeze(
          Object.fromEntries(
            Object.entries(settlement.bestHands).map(([playerId, best]) => [
              playerId,
              Object.freeze({
                rank: best.rank,
                bestFiveCards: Object.freeze(best.cards.map(formatCard)),
              }),
            ]),
          ),
        )
      : (() => {
          const winner = hand.players.find(
            ({ playerId }) => playerId === settlement.winnerIds[0],
          );
          const availableCards = winner
            ? [...winner.holeCards, ...hand.communityCards]
            : [];
          if (!winner || availableCards.length < 5) return Object.freeze({});
          const best = findBestFiveCardHand(availableCards);
          return Object.freeze({
            [winner.playerId]: Object.freeze({
              rank: best.rank,
              bestFiveCards: Object.freeze(best.cards.map(formatCard)),
            }),
          });
        })();

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
    evaluatedHands,
  });
}
