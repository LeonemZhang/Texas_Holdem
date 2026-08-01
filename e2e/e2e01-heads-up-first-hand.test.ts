import { describe, expect, it } from 'vitest';

import type { BettingCommand } from '@texas-holdem/protocol';

import { CommandDispatcher } from '../apps/host/src/application/command-dispatcher.js';
import { GameCommandHandler } from '../apps/host/src/application/game-command-handler.js';
import { RoomCommandHandler } from '../apps/host/src/application/room-command-handler.js';
import { InMemoryRoomRegistry } from '../apps/host/src/application/room-registry.js';

describe('LUNA-E2E01 heads-up first hand', () => {
  it('requires all-ready plus a manual host start, uses heads-up order, settles, and conserves chips', () => {
    const rooms = new InMemoryRoomRegistry();
    const roomHandler = new RoomCommandHandler(rooms, { next: () => 0.25 });
    const gameHandler = new GameCommandHandler(
      rooms,
      roomHandler,
      () => 10_000,
    );
    const dispatcher = new CommandDispatcher(
      rooms,
      (command, room) =>
        command.type === 'room.create' ||
        command.type === 'room.join' ||
        room?.players.some(({ playerId }) => playerId === command.playerId) ===
          true,
      (command, room) =>
        command.type.startsWith('game.')
          ? gameHandler.handle(command as BettingCommand, room)
          : roomHandler.handle(command, room),
    );
    const submit = (command: Record<string, unknown>) => {
      const response = dispatcher.dispatch({
        protocolVersion: '1',
        ...command,
      });
      expect(response.status).toBe('accepted');
      return response;
    };
    const version = () => rooms.get('room-1')?.version ?? 0;

    submit({
      commandId: 'create',
      roomId: 'room-1',
      playerId: 'host',
      expectedVersion: 0,
      type: 'room.create',
      hostNickname: 'Alice',
      settings: {
        roomName: '朋友局',
        maxPlayers: 10,
        initialChips: 100,
        smallBlind: 1,
        actionTimeoutSeconds: 30,
        handReadyTimeoutSeconds: 30,
        blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
        zeroChipPolicy: 'request-chips',
      },
    });
    submit({
      commandId: 'join',
      roomId: 'room-1',
      playerId: 'bob',
      expectedVersion: version(),
      type: 'room.join',
      nickname: 'Bob',
    });
    for (const playerId of ['host', 'bob']) {
      submit({
        commandId: `ready-${playerId}`,
        roomId: 'room-1',
        playerId,
        expectedVersion: version(),
        type: 'room.set-lobby-ready',
        ready: true,
      });
    }

    expect(rooms.get('room-1')?.phase).toBe('lobby');
    expect(roomHandler.getCurrentHand('room-1')).toBeNull();
    submit({
      commandId: 'start',
      roomId: 'room-1',
      playerId: 'host',
      expectedVersion: version(),
      type: 'room.start-first-hand',
      handId: 'hand-1',
    });

    const hand = roomHandler.getCurrentHand('room-1')!;
    expect(hand.positions.button.playerId).toBe(
      hand.positions.smallBlind.playerId,
    );
    expect(hand.betting.currentActorId).toBe(hand.positions.button.playerId);
    const actor = hand.betting.currentActorId!;
    submit({
      commandId: 'fold',
      roomId: 'room-1',
      playerId: actor,
      expectedVersion: version(),
      type: 'game.fold',
    });

    const settledRoom = rooms.get('room-1')!;
    expect(settledRoom.phase).toBe('hand-ready');
    expect(
      settledRoom.players.reduce((sum, player) => sum + player.chips, 0),
    ).toBe(200);
    expect(roomHandler.getHandReady('room-1')).toMatchObject({
      afterHandId: 'hand-1',
      startedAtMs: 10_000,
      deadlineMs: 40_000,
    });
  });
});
