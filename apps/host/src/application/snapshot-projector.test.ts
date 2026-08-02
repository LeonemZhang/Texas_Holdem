import { describe, expect, it } from 'vitest';

import { formatCard, type ShowdownSettledHand } from '@texas-holdem/poker-core';

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
    expect(hostSnapshot.game?.actionDeadlineMs).toBe(30_000);
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
    expect(hostSnapshot.game?.settlement).toEqual({
      reason: 'showdown',
      winnerIds: ['host'],
      payouts: { host: 100 },
    });
  });
});
