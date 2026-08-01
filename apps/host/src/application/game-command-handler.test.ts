import { describe, expect, it } from 'vitest';

import { legalBettingActions } from '@texas-holdem/poker-core';

import { GameCommandHandler } from './game-command-handler.js';
import { RoomCommandHandler } from './room-command-handler.js';
import { InMemoryRoomRegistry } from './room-registry.js';

const identity = {
  protocolVersion: '1' as const,
  commandId: 'command-1',
  roomId: 'room-1',
  playerId: 'host',
  expectedVersion: 0,
};

function playingRoom() {
  const rooms = new InMemoryRoomRegistry();
  const runtime = new RoomCommandHandler(rooms, { next: () => 0.5 });
  runtime.handle(
    {
      ...identity,
      type: 'room.create',
      hostNickname: 'Alice',
      settings: {
        roomName: 'Friends',
        maxPlayers: 10,
        initialChips: 100,
        smallBlind: 1,
        actionTimeoutSeconds: 30,
        handReadyTimeoutSeconds: 30,
        blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
        zeroChipPolicy: 'request-chips',
      },
    },
    null,
  );
  const room = rooms.get('room-1')!;
  runtime.handle(
    {
      ...identity,
      commandId: 'join',
      playerId: 'bob',
      type: 'room.join',
      nickname: 'Bob',
    },
    room,
  );
  for (const playerId of ['host', 'bob']) {
    runtime.handle(
      {
        ...identity,
        commandId: `ready-${playerId}`,
        playerId,
        type: 'room.set-lobby-ready',
        ready: true,
      },
      rooms.get('room-1'),
    );
  }
  runtime.handle(
    {
      ...identity,
      commandId: 'start',
      type: 'room.start-first-hand',
      handId: 'hand-1',
    },
    rooms.get('room-1'),
  );
  return { rooms, runtime };
}

describe('GameCommandHandler', () => {
  it('delegates a legal current-player action to poker-core', () => {
    const { rooms, runtime } = playingRoom();
    const handler = new GameCommandHandler(rooms, runtime);
    const before = runtime.getCurrentHand('room-1')!;
    const playerId = before.betting.currentActorId!;
    const legal = legalBettingActions(before.betting, playerId);
    const type = legal.callAmount === null ? 'game.check' : 'game.call';

    const result = handler.handle(
      { ...identity, commandId: 'act', playerId, type },
      rooms.get('room-1'),
    );

    expect(result.stateVersion).toBe(rooms.get('room-1')?.version);
    expect(runtime.getCurrentHand('room-1')).not.toBe(before);
  });

  it('lets poker-core reject an action from a non-current player', () => {
    const { rooms, runtime } = playingRoom();
    const handler = new GameCommandHandler(rooms, runtime);
    const before = runtime.getCurrentHand('room-1')!;
    const otherPlayer = before.players.find(
      ({ playerId }) => playerId !== before.betting.currentActorId,
    )!;

    expect(() =>
      handler.handle(
        {
          ...identity,
          commandId: 'out-of-turn',
          playerId: otherPlayer.playerId,
          type: 'game.fold',
        },
        rooms.get('room-1'),
      ),
    ).toThrow(`It is not ${otherPlayer.playerId}'s turn`);
    expect(runtime.getCurrentHand('room-1')).toBe(before);
  });

  it('maps protocol raise-to and all-in names to core actions', () => {
    const raised = playingRoom();
    const raiseHandler = new GameCommandHandler(raised.rooms, raised.runtime);
    const raiseHand = raised.runtime.getCurrentHand('room-1')!;
    const raiser = raiseHand.betting.currentActorId!;
    const legal = legalBettingActions(raiseHand.betting, raiser);
    expect(legal.minimumRaiseTo).not.toBeNull();
    raiseHandler.handle(
      {
        ...identity,
        commandId: 'raise',
        playerId: raiser,
        type: 'game.raise-to',
        amount: legal.minimumRaiseTo!,
      },
      raised.rooms.get('room-1'),
    );
    expect(raised.runtime.getCurrentHand('room-1')?.betting.currentBet).toBe(
      legal.minimumRaiseTo,
    );

    const allIn = playingRoom();
    const allInHandler = new GameCommandHandler(allIn.rooms, allIn.runtime);
    const allInHand = allIn.runtime.getCurrentHand('room-1')!;
    const allInPlayer = allInHand.betting.currentActorId!;
    allInHandler.handle(
      {
        ...identity,
        commandId: 'all-in',
        playerId: allInPlayer,
        type: 'game.all-in',
      },
      allIn.rooms.get('room-1'),
    );
    expect(
      allIn.runtime
        .getCurrentHand('room-1')
        ?.players.find(({ playerId }) => playerId === allInPlayer)?.status,
    ).toBe('all-in');
  });
});
