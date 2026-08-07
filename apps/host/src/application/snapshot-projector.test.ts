import { describe, expect, it } from 'vitest';

import {
  formatCard,
  parseCard,
  applyHandAction,
  type ShowdownSettledHand,
  type UncontestedSettledHand,
} from '@texas-holdem/poker-core';

import { createRoom } from '../domain/room.js';
import { joinRoom } from '../domain/join-room.js';
import { setLobbyReady } from '../domain/lobby-ready.js';
import { startFirstHand } from '../domain/start-first-hand.js';
import { projectPlayerSnapshot } from './snapshot-projector.js';

function startedRoom() {
  let room = createRoom({
    roomId: 'room-1',
    hostPlayerId: 'host',
    hostNickname: 'Alice',
    settings: {
      roomName: 'Friends',
      maxPlayers: 10,
      initialChips: 100,
      blind: { kind: 'preset', smallBlind: 1 },
      actionTimeoutSeconds: 30,
      handReadyTimeoutSeconds: 30,
      blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
      zeroChipPolicy: 'request-chips',
    },
  });
  room = joinRoom(room, { playerId: 'bob', nickname: 'Bob' });
  room = setLobbyReady(room, 'host', true);
  room = setLobbyReady(room, 'bob', true);
  return startFirstHand(room, 'host', 'hand-1', { next: () => 0.5 });
}

describe('projectPlayerSnapshot', () => {
  it('projects the blind level actually used by an active hand', () => {
    const started = startedRoom();
    const grownHand = {
      ...started.hand,
      smallBlind: 20,
      bigBlind: 40,
    };
    const snapshot = projectPlayerSnapshot({
      room: started.room,
      viewerPlayerId: 'host',
      sequence: 1,
      hand: grownHand,
    });

    expect(snapshot.room.smallBlind).toBe(20);
    expect(snapshot.room.bigBlind).toBe(40);
    expect(snapshot.room.settings?.smallBlind).toBe(1);
  });

  it('projects the upcoming grown blind during hand readiness', () => {
    const started = startedRoom();
    const room = { ...started.room, phase: 'hand-ready' as const };
    const snapshot = projectPlayerSnapshot({
      room,
      viewerPlayerId: 'host',
      sequence: 2,
      completedHands: 10,
      hand: started.hand,
    });

    expect(snapshot.room.smallBlind).toBe(2);
    expect(snapshot.room.bigBlind).toBe(4);
  });

  it('projects only the viewing player hole cards for host and guest alike', () => {
    const started = startedRoom();
    const hostSnapshot = projectPlayerSnapshot({
      room: started.room,
      viewerPlayerId: 'host',
      sequence: 1,
      hand: started.hand,
      actionDeadlineMs: 30_000,
    });
    const bobSnapshot = projectPlayerSnapshot({
      room: started.room,
      viewerPlayerId: 'bob',
      sequence: 1,
      hand: started.hand,
      actionDeadlineMs: 30_000,
    });
    const hostCards = started.hand.players
      .find(({ playerId }) => playerId === 'host')!
      .holeCards.map(formatCard);
    const bobCards = started.hand.players
      .find(({ playerId }) => playerId === 'bob')!
      .holeCards.map(formatCard);

    expect(hostSnapshot.game?.ownHoleCards).toEqual(hostCards);
    expect(bobSnapshot.game?.ownHoleCards).toEqual(bobCards);
    expect(hostSnapshot.game?.ownHandType).toBeNull();
    expect(hostSnapshot.game?.actionDeadlineMs).toBe(30_000);
    expect(hostSnapshot.game?.totalPot).toBe(3);
    expect(hostSnapshot.game?.streetPots).toEqual([
      { street: 'preflop', amount: 3 },
    ]);
    expect(hostSnapshot.room.settings).toEqual({
      roomName: 'Friends',
      maxPlayers: 10,
      initialChips: 100,
      smallBlind: 1,
      actionTimeoutSeconds: 30,
      handReadyTimeoutSeconds: 30,
      blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
      zeroChipPolicy: 'request-chips',
    });
    expect(hostSnapshot.room.players).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          streetCommitted: expect.any(Number),
          totalCommitted: expect.any(Number),
          actionOrder: expect.any(Number),
        }),
      ]),
    );
    expect(JSON.stringify(hostSnapshot)).not.toContain(bobCards[0]);
    expect(JSON.stringify(hostSnapshot)).not.toContain(bobCards[1]);
    expect(JSON.stringify(bobSnapshot)).not.toContain(hostCards[0]);
    expect(JSON.stringify(bobSnapshot)).not.toContain(hostCards[1]);
    expect(JSON.stringify(hostSnapshot)).not.toContain('deck');
  });

  it('keeps completed street totals fixed while publishing the live street total', () => {
    const started = startedRoom();
    const hand = {
      ...started.hand,
      street: 'flop' as const,
      completedStreetPots: [{ street: 'preflop' as const, amount: 3 }],
      players: started.hand.players.map((player, index) => ({
        ...player,
        streetCommitted: index === 0 ? 4 : 6,
        totalCommitted: index === 0 ? 5 : 8,
      })),
    };
    const snapshot = projectPlayerSnapshot({
      room: started.room,
      viewerPlayerId: 'host',
      sequence: 2,
      hand,
    });

    expect(snapshot.game?.totalPot).toBe(13);
    expect(snapshot.game?.streetPots).toEqual([
      { street: 'preflop', amount: 3 },
      { street: 'flop', amount: 10 },
    ]);
  });

  it('uses room balances even while retaining the settled hand for hand readiness', () => {
    const started = startedRoom();
    const room = {
      ...started.room,
      phase: 'hand-ready' as const,
      players: started.room.players.map((player) =>
        player.playerId === 'bob' ? { ...player, chips: 77 } : player,
      ),
    };
    const snapshot = projectPlayerSnapshot({
      room,
      viewerPlayerId: 'host',
      sequence: 2,
      hand: started.hand,
    });

    expect(
      snapshot.room.players.find(({ playerId }) => playerId === 'bob')?.chips,
    ).toBe(77);
  });

  it('only projects legal actions for the server-selected current actor', () => {
    const started = startedRoom();
    const actorId = started.hand.betting.currentActorId!;
    const otherId = actorId === 'host' ? 'bob' : 'host';
    const actor = projectPlayerSnapshot({
      room: started.room,
      viewerPlayerId: actorId,
      sequence: 1,
      hand: started.hand,
      actionDeadlineMs: 30_000,
    });
    const other = projectPlayerSnapshot({
      room: started.room,
      viewerPlayerId: otherId,
      sequence: 1,
      hand: started.hand,
      actionDeadlineMs: 30_000,
    });

    expect(actor.game?.legalActions).not.toBeNull();
    expect(other.game?.legalActions).toBeNull();
  });

  it('does not assign an action order to a player who has already folded', () => {
    const started = startedRoom();
    const folded = applyHandAction(
      started.hand,
      started.hand.betting.currentActorId!,
      { type: 'fold' },
    );
    const nextActorId = folded.betting.currentActorId!;
    const snapshot = projectPlayerSnapshot({
      room: started.room,
      viewerPlayerId: nextActorId,
      sequence: 2,
      hand: folded,
    });

    expect(
      snapshot.room.players.find(({ playerId }) => playerId !== nextActorId),
    ).toMatchObject({ actionOrder: null });
    expect(
      snapshot.room.players.find(({ playerId }) => playerId === nextActorId),
    ).toMatchObject({ actionOrder: 1 });
  });

  it('publishes only settled showdown contender cards to every viewer', () => {
    const started = startedRoom();
    const revealedHoleCards = Object.fromEntries(
      started.hand.players.map((player) => [player.playerId, player.holeCards]),
    );
    const settled = {
      ...started.hand,
      settlement: {
        reason: 'showdown',
        winnerIds: ['host'],
        payouts: { host: 100 },
        revealedHoleCards,
      },
    } as unknown as ShowdownSettledHand;

    const hostSnapshot = projectPlayerSnapshot({
      room: started.room,
      viewerPlayerId: 'host',
      sequence: 2,
      hand: settled,
    });
    const bobSnapshot = projectPlayerSnapshot({
      room: started.room,
      viewerPlayerId: 'bob',
      sequence: 2,
      hand: settled,
    });
    const expected = Object.fromEntries(
      Object.entries(revealedHoleCards).map(([playerId, cards]) => [
        playerId,
        cards.map(formatCard),
      ]),
    );

    expect(hostSnapshot.game?.showdownHoleCards).toEqual(expected);
    expect(bobSnapshot.game?.showdownHoleCards).toEqual(expected);
    expect(hostSnapshot.game?.settlement).toMatchObject({
      reason: 'showdown',
      winnerIds: ['host'],
      payouts: { host: 100 },
    });
    expect(hostSnapshot.game?.settlement?.netChanges).toEqual({
      host: 99,
      bob: -2,
    });
  });

  it('excludes an unmatched all-in layer from the settled total pot', () => {
    const started = startedRoom();
    const settled = {
      ...started.hand,
      settlement: {
        reason: 'showdown',
        winnerIds: ['host'],
        payouts: { host: 200, bob: 100 },
        revealedHoleCards: {},
        pots: [
          {
            amount: 200,
            contributorIds: ['host', 'bob'],
            eligiblePlayerIds: ['host', 'bob'],
          },
          {
            amount: 100,
            contributorIds: ['bob'],
            eligiblePlayerIds: ['bob'],
            unmatchedPlayerId: 'bob',
          },
        ],
        awards: [
          { potIndex: 0, winnerIds: ['host'], equalShare: 200 },
          {
            potIndex: 1,
            winnerIds: [],
            equalShare: 100,
            oddChipWinnerIds: [],
            refundedPlayerId: 'bob',
          },
        ],
        bestHands: {},
      },
    } as unknown as ShowdownSettledHand;

    const snapshot = projectPlayerSnapshot({
      room: started.room,
      viewerPlayerId: 'host',
      sequence: 2,
      hand: settled,
    });

    expect(snapshot.game?.totalPot).toBe(200);
  });

  it('projects the current best hand type after five cards are available', () => {
    const started = startedRoom();
    const hand = {
      ...started.hand,
      communityCards: [parseCard('Qd'), parseCard('Jh'), parseCard('Tc')],
      players: started.hand.players.map((player) =>
        player.playerId === 'host'
          ? {
              ...player,
              holeCards: [parseCard('As'), parseCard('Ks')] as const,
            }
          : player,
      ),
    };

    const snapshot = projectPlayerSnapshot({
      room: started.room,
      viewerPlayerId: 'host',
      sequence: 2,
      hand,
    });

    expect(snapshot.game?.ownHandType).toBe('straight');
  });

  it('projects a hand type for a voluntarily revealed player when five cards exist', () => {
    const started = startedRoom();
    const hand = {
      ...started.hand,
      communityCards: [parseCard('Qd'), parseCard('Jh'), parseCard('Tc')],
      players: started.hand.players.map((player) =>
        player.playerId === 'host'
          ? {
              ...player,
              holeCards: [parseCard('As'), parseCard('Ks')] as const,
            }
          : player,
      ),
      settlement: {
        reason: 'uncontested' as const,
        winnerIds: ['host'],
        payouts: { host: 100 },
        revealedHoleCards: {},
      },
    } as unknown as UncontestedSettledHand;
    const room = {
      ...started.room,
      phase: 'hand-ready' as const,
      voluntarilyRevealedHoleCardPlayerIds: ['host'],
    };

    const snapshot = projectPlayerSnapshot({
      room,
      viewerPlayerId: 'bob',
      sequence: 2,
      hand,
    });

    expect(snapshot.game?.settlement?.revealedHandResults).toEqual([
      {
        playerId: 'host',
        handType: 'straight',
        bestFiveCards: ['Qd', 'Jh', 'Tc', 'As', 'Ks'],
      },
    ]);
  });
});
