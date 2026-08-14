import { describe, expect, it } from 'vitest';

import {
  PROTOCOL_VERSION,
  type BettingCommand,
} from '../packages/protocol/src/index.js';

import { CommandDispatcher } from '../apps/host/src/application/command-dispatcher.js';
import { GameCommandHandler } from '../apps/host/src/application/game-command-handler.js';
import { RoomCommandHandler } from '../apps/host/src/application/room-command-handler.js';
import { InMemoryRoomRegistry } from '../apps/host/src/application/room-registry.js';

const settings = {
  roomName: 'Late join table',
  maxPlayers: 10,
  initialChips: 100,
  smallBlind: 1,
  actionTimeoutSeconds: 30,
  handReadyTimeoutSeconds: 30,
  blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
  zeroChipPolicy: 'request-chips' as const,
};

describe('LATEJOIN-E2E next-hand participation', () => {
  it('keeps a playing-room late joiner out of the current hand', () => {
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
    let commandNumber = 0;
    const send = (playerId: string, type: string, extra = {}) => {
      const response = dispatcher.dispatch({
        protocolVersion: PROTOCOL_VERSION,
        commandId: `late-join-${++commandNumber}`,
        roomId: 'room-1',
        playerId,
        expectedVersion: rooms.get('room-1')?.version ?? 0,
        type,
        ...extra,
      });
      expect(response.status).toBe('accepted');
      return response;
    };

    send('host', 'room.create', { hostNickname: 'Alice', settings });
    send('bob', 'room.join', { nickname: 'Bob' });
    send('host', 'room.set-lobby-ready', { ready: true });
    send('bob', 'room.set-lobby-ready', { ready: true });
    send('host', 'room.start-first-hand', { handId: 'hand-1' });

    const currentHand = roomHandler.getCurrentHand('room-1')!;
    const currentHandId = currentHand.handId;
    send('carol', 'room.join', { nickname: 'Carol' });
    expect(rooms.get('room-1')?.players).toContainEqual(
      expect.objectContaining({ playerId: 'carol', status: 'waiting' }),
    );
    expect(roomHandler.getCurrentHand('room-1')?.players).toHaveLength(2);

    const actorId = currentHand.betting.currentActorId!;
    send(actorId, 'game.fold');
    expect(rooms.get('room-1')?.phase).toBe('hand-ready');
    expect(roomHandler.getHandReady('room-1')?.players).toContainEqual({
      playerId: 'carol',
      choice: 'pending',
    });

    send('dave', 'room.join', { nickname: 'Dave' });
    expect(roomHandler.getHandReady('room-1')?.players).toContainEqual({
      playerId: 'dave',
      choice: 'pending',
    });
    send('host', 'hand-ready.set-choice', { choice: 'ready' });
    send('bob', 'hand-ready.set-choice', { choice: 'ready' });
    send('carol', 'hand-ready.set-choice', { choice: 'ready' });
    send('dave', 'hand-ready.set-choice', { choice: 'sitting-out' });

    const nextRoom = roomHandler.startNextHandIfReady('room-1', {
      handId: 'hand-2',
      nowMs: 50_000,
      deadlineElapsed: false,
      smallBlind: 1,
      bigBlind: 2,
    });
    const nextHand = roomHandler.getCurrentHand('room-1');
    expect(nextRoom?.phase).toBe('playing');
    expect(nextHand?.handId).toBe('hand-2');
    expect(nextHand?.players).toHaveLength(3);
    expect(nextRoom?.players).toContainEqual(
      expect.objectContaining({ playerId: 'carol', status: 'active' }),
    );
    expect(nextHand?.handId).not.toBe(currentHandId);

    send('host', 'room.close');
    expect(() => send('erin', 'room.join', { nickname: 'Erin' })).toThrow(
      'New players cannot join in the current room phase',
    );
  });
});
