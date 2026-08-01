import { describe, expect, it } from 'vitest';

import { legalBettingActions } from '../betting/betting-round.js';
import { formatCard } from '../cards/card.js';
import { applyHandAction } from './hand-reducer.js';
import { settleShowdown } from './showdown.js';
import { startHand } from './start-hand.js';
import { advanceAfterCompletedBetting } from './streets.js';
import { createHandSummary } from './summary.js';

describe('deterministic complete hands', () => {
  it.each([2, 3, 10])(
    'plays a complete %s-player all-in hand',
    (playerCount) => {
      let hand = startHand({
        handId: `complete-${playerCount}`,
        participants: Array.from({ length: playerCount }, (_, index) => ({
          playerId: `p${index}`,
          seatIndex: index,
          stack: 2,
        })),
        previousButtonIndex: null,
        smallBlind: 1,
        randomSource: { next: () => 0 },
      });

      while (hand.betting.currentActorId !== null) {
        const actor = hand.betting.currentActorId;
        const legal = legalBettingActions(hand.betting);
        hand = applyHandAction(
          hand,
          actor,
          legal.callAmount !== null
            ? { type: 'call' }
            : legal.canCheck
              ? { type: 'check' }
              : { type: 'allIn' },
        );
      }
      hand = advanceAfterCompletedBetting(hand);
      const settled = settleShowdown(hand);
      const summary = createHandSummary(settled);

      expect(hand.street).toBe('river');
      expect(hand.communityCards).toHaveLength(5);
      expect(
        settled.players.reduce((sum, player) => sum + player.stack, 0),
      ).toBe(playerCount * 2);
      const visibleCards = [
        ...hand.communityCards,
        ...hand.players.flatMap(({ holeCards }) => holeCards),
      ].map(formatCard);
      expect(new Set(visibleCards).size).toBe(visibleCards.length);
      expect(summary.participants).toHaveLength(playerCount);
    },
  );
});
