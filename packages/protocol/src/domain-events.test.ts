import { describe, expect, it } from 'vitest';

import { DomainEventSchema } from './domain-events.js';
import { PROTOCOL_VERSION } from './system.js';

const metadata = {
  protocolVersion: PROTOCOL_VERSION,
  eventId: 'event-1',
  roomId: 'room-1',
  sequence: 1,
  stateVersion: 2,
};

const events: readonly Record<string, unknown>[] = [
  {
    ...metadata,
    type: 'room.created',
    hostPlayerId: 'host',
    settings: {
      roomName: 'Friends',
      maxPlayers: 10,
      initialChips: 2_000,
      smallBlind: 1,
      actionTimeoutSeconds: 30,
      handReadyTimeoutSeconds: 30,
      blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
      zeroChipPolicy: 'request-chips',
    },
  },
  {
    ...metadata,
    type: 'player.joined',
    playerId: 'p1',
    nickname: 'Bob',
    seatIndex: 1,
    chips: 2_000,
  },
  {
    ...metadata,
    type: 'player.status-changed',
    playerId: 'p1',
    status: 'removed',
  },
  { ...metadata, type: 'lobby.ready-changed', playerId: 'p1', ready: true },
  {
    ...metadata,
    type: 'hand.started',
    handId: 'h1',
    buttonPlayerId: 'p1',
    smallBlindPlayerId: 'p1',
    bigBlindPlayerId: 'p2',
  },
  {
    ...metadata,
    type: 'hand.player-acted',
    handId: 'h1',
    playerId: 'p1',
    action: 'call',
    amount: 2,
  },
  {
    ...metadata,
    type: 'hand.summary',
    handId: 'h1',
    reason: 'uncontested',
    communityCards: [],
    investments: { p1: 1, p2: 2 },
    winnerIds: ['p2'],
    payouts: { p2: 3 },
    netChanges: { p1: -1, p2: 1 },
    revealedHoleCards: {},
  },
  {
    ...metadata,
    type: 'hand-ready.started',
    afterHandId: 'h1',
    deadlineMs: 30_000,
  },
  {
    ...metadata,
    type: 'hand-ready.choice-changed',
    playerId: 'p1',
    choice: 'ready',
  },
  {
    ...metadata,
    type: 'chips.request-changed',
    requestId: 'r1',
    requesterId: 'p1',
    status: 'pending',
    amount: 20,
  },
  {
    ...metadata,
    type: 'chips.transfer-completed',
    transferId: 't1',
    fromPlayerId: 'p2',
    toPlayerId: 'p1',
    amount: 20,
  },
  { ...metadata, type: 'room.control-changed', phase: 'paused' },
  {
    ...metadata,
    type: 'statistics.updated',
    playerId: 'p1',
    currentChips: 100,
    participatedHands: 1,
    wonHands: 0,
  },
  {
    ...metadata,
    type: 'statistics.titles-updated',
    titles: [{ title: 'all-in-king', playerIds: ['p1'], value: 3 }],
  },
];

describe('DomainEventSchema', () => {
  it('round-trips every discriminated server event through JSON', () => {
    for (const event of events) {
      const parsed = DomainEventSchema.parse(event);
      expect(
        DomainEventSchema.parse(JSON.parse(JSON.stringify(parsed))),
      ).toEqual(parsed);
    }
  });

  it.each(['sequence', 'stateVersion'])(
    'requires %s on every event',
    (field) => {
      const event = { ...events[1] };
      delete event[field];
      expect(DomainEventSchema.safeParse(event).success).toBe(false);
    },
  );
});
