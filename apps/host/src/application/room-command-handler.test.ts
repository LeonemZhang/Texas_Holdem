import { describe, expect, it } from 'vitest';

import { beginHandReadyPhase } from '../domain/hand-ready.js';
import { InMemoryRoomRegistry } from './room-registry.js';
import { RoomCommandHandler } from './room-command-handler.js';

const random = { next: () => 0.5 };
const identity = {
  protocolVersion: '3' as const,
  commandId: 'command-1',
  roomId: 'room-1',
  playerId: 'host',
  expectedVersion: 0,
};

function createCommand() {
  return {
    ...identity,
    type: 'room.create' as const,
    hostNickname: 'Alice',
    settings: {
      roomName: 'Friends',
      maxPlayers: 10,
      initialChips: 100,
      smallBlind: 1,
      actionTimeoutSeconds: 30,
      handReadyTimeoutSeconds: 30,
      blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
      zeroChipPolicy: 'request-chips' as const,
    },
  };
}

describe('RoomCommandHandler', () => {
  it('maps the host lobby room-settings update command', () => {
    const rooms = new InMemoryRoomRegistry();
    const handler = new RoomCommandHandler(rooms, random);
    handler.handle(createCommand(), null);
    const room = rooms.get('room-1');

    handler.handle(
      {
        ...identity,
        commandId: 'update-settings',
        type: 'room.update-settings',
        settings: {
          ...createCommand().settings,
          roomName: 'Updated friends',
          initialChips: 250,
          smallBlind: 5,
        },
      },
      room,
    );

    expect(rooms.get('room-1')?.settings).toMatchObject({
      roomName: 'Updated friends',
      initialChips: 250,
      smallBlind: 5,
      bigBlind: 10,
    });
  });

  it('maps create, join, lobby readiness, first-hand start, pause and resume', () => {
    const rooms = new InMemoryRoomRegistry();
    const handler = new RoomCommandHandler(rooms, random);
    handler.handle(createCommand(), null);
    let room = rooms.get('room-1');
    expect(room?.settings).toMatchObject({ smallBlind: 1, bigBlind: 2 });

    handler.handle(
      {
        ...identity,
        commandId: 'join',
        playerId: 'bob',
        type: 'room.join',
        nickname: 'Bob',
      },
      room,
    );
    room = rooms.get('room-1');
    handler.handle(
      {
        ...identity,
        commandId: 'remove',
        type: 'room.remove-player',
        targetPlayerId: 'bob',
      },
      room,
    );
    room = rooms.get('room-1');
    expect(
      room?.players.find(({ playerId }) => playerId === 'bob')?.status,
    ).toBe('removed');
  });

  it('maps first-hand start, pause and resume after the lobby is ready', () => {
    const rooms = new InMemoryRoomRegistry();
    const handler = new RoomCommandHandler(rooms, random);
    handler.handle(createCommand(), null);
    let room = rooms.get('room-1');
    handler.handle(
      {
        ...identity,
        commandId: 'join',
        playerId: 'bob',
        type: 'room.join',
        nickname: 'Bob',
      },
      room,
    );
    room = rooms.get('room-1');
    handler.handle(
      {
        ...identity,
        commandId: 'host-ready',
        type: 'room.set-lobby-ready',
        ready: true,
      },
      room,
    );
    room = rooms.get('room-1');
    handler.handle(
      {
        ...identity,
        commandId: 'bob-ready',
        playerId: 'bob',
        type: 'room.set-lobby-ready',
        ready: true,
      },
      room,
    );
    room = rooms.get('room-1');
    handler.handle(
      {
        ...identity,
        commandId: 'start',
        type: 'room.start-first-hand',
        handId: 'hand-1',
      },
      room,
    );
    room = rooms.get('room-1');
    expect(handler.getCurrentHand('room-1')?.handId).toBe('hand-1');
    expect(room?.phase).toBe('playing');

    handler.handle(
      { ...identity, commandId: 'pause', type: 'room.pause' },
      room,
    );
    room = rooms.get('room-1');
    expect(room?.phase).toBe('paused');
    handler.handle(
      { ...identity, commandId: 'resume', type: 'room.resume' },
      room,
    );
    expect(rooms.get('room-1')?.phase).toBe('playing');
  });

  it('maps hand-ready choices, requests and chip transfers through domain services', () => {
    const rooms = new InMemoryRoomRegistry();
    const handler = new RoomCommandHandler(rooms, random);
    handler.handle(createCommand(), null);
    let room = rooms.get('room-1')!;
    handler.handle(
      {
        ...identity,
        commandId: 'join',
        playerId: 'bob',
        type: 'room.join',
        nickname: 'Bob',
      },
      room,
    );
    room = rooms.get('room-1')!;
    handler.handle(
      {
        ...identity,
        commandId: 'host-ready',
        type: 'room.set-lobby-ready',
        ready: true,
      },
      room,
    );
    room = rooms.get('room-1')!;
    handler.handle(
      {
        ...identity,
        commandId: 'bob-ready',
        playerId: 'bob',
        type: 'room.set-lobby-ready',
        ready: true,
      },
      room,
    );
    room = rooms.get('room-1')!;
    handler.handle(
      {
        ...identity,
        commandId: 'start',
        type: 'room.start-first-hand',
        handId: 'hand-1',
      },
      room,
    );
    room = rooms.get('room-1')!;
    handler.enterHandReady(beginHandReadyPhase(room, 'hand-1', 1_000));
    room = rooms.get('room-1')!;

    handler.handle(
      {
        ...identity,
        commandId: 'late-join',
        playerId: 'carol',
        type: 'room.join',
        nickname: 'Carol',
      },
      room,
    );
    room = rooms.get('room-1')!;
    expect(
      room.players.find(({ playerId }) => playerId === 'carol'),
    ).toMatchObject({
      status: 'waiting',
      chips: 100,
    });
    expect(handler.getHandReady('room-1')?.players).toContainEqual({
      playerId: 'carol',
      choice: 'pending',
    });

    handler.handle(
      {
        ...identity,
        commandId: 'choice',
        type: 'hand-ready.set-choice',
        choice: 'ready',
      },
      room,
    );
    room = rooms.get('room-1')!;
    handler.handle(
      {
        ...identity,
        commandId: 'request',
        playerId: 'bob',
        type: 'chips.request',
        requestId: 'request-1',
        targetPlayerId: 'host',
        amount: 20,
      },
      room,
    );
    room = rooms.get('room-1')!;
    handler.handle(
      {
        ...identity,
        commandId: 'approve',
        type: 'chips.approve',
        requestId: 'request-1',
        transferId: 'transfer-1',
      },
      room,
    );

    const nextRoom = rooms.get('room-1')!;
    expect(nextRoom.players.map(({ chips }) => chips)).toEqual([79, 118, 100]);
    expect(handler.getHandReady('room-1')?.players[0]?.choice).toBe('ready');
    expect(handler.getChipRequests('room-1')?.requests[0]?.status).toBe(
      'completed',
    );
  });

  it('requires every player to approve a chip reset before restoring initial stacks', () => {
    const rooms = new InMemoryRoomRegistry();
    const handler = new RoomCommandHandler(rooms, random);
    handler.handle(createCommand(), null);
    let room = rooms.get('room-1')!;
    handler.handle(
      {
        ...identity,
        commandId: 'join',
        playerId: 'bob',
        type: 'room.join',
        nickname: 'Bob',
      },
      room,
    );
    room = rooms.get('room-1')!;
    const depleted = Object.freeze({
      ...room,
      phase: 'playing' as const,
      firstHandStarted: true,
      players: Object.freeze(
        room.players.map((player) =>
          player.playerId === 'bob'
            ? Object.freeze({ ...player, chips: 0 })
            : player,
        ),
      ),
    });
    handler.enterHandReady(beginHandReadyPhase(depleted, 'hand-1', 1_000));
    room = rooms.get('room-1')!;
    expect(handler.getHandReady('room-1')?.chipResetVote).toBeTruthy();

    handler.handle(
      {
        ...identity,
        commandId: 'vote-host',
        expectedVersion: room.version,
        type: 'hand-ready.set-chip-reset-vote',
        vote: 'approve',
      },
      room,
    );
    room = rooms.get('room-1')!;
    expect(handler.getHandReady('room-1')?.chipResetVote?.players).toEqual([
      { playerId: 'host', vote: 'approve' },
      { playerId: 'bob', vote: 'pending' },
    ]);

    handler.handle(
      {
        ...identity,
        commandId: 'vote-bob',
        playerId: 'bob',
        expectedVersion: room.version,
        type: 'hand-ready.set-chip-reset-vote',
        vote: 'approve',
      },
      room,
    );
    expect(rooms.get('room-1')?.players.map(({ chips }) => chips)).toEqual([
      100, 100,
    ]);
    expect(handler.getHandReady('room-1')?.chipResetVote).toBeNull();
    expect(handler.getHandReady('room-1')?.players).toEqual([
      { playerId: 'host', choice: 'pending' },
      { playerId: 'bob', choice: 'pending' },
    ]);
    expect(handler.getChipRequests('room-1')?.requests).toEqual([]);
  });

  it('retains a failed reset vote after any player rejects it', () => {
    const rooms = new InMemoryRoomRegistry();
    const handler = new RoomCommandHandler(rooms, random);
    handler.handle(createCommand(), null);
    let room = rooms.get('room-1')!;
    handler.handle(
      {
        ...identity,
        commandId: 'join',
        playerId: 'bob',
        type: 'room.join',
        nickname: 'Bob',
      },
      room,
    );
    room = rooms.get('room-1')!;
    const depleted = Object.freeze({
      ...room,
      phase: 'playing' as const,
      firstHandStarted: true,
      players: Object.freeze(
        room.players.map((player) =>
          player.playerId === 'bob'
            ? Object.freeze({ ...player, chips: 0 })
            : player,
        ),
      ),
    });
    handler.enterHandReady(beginHandReadyPhase(depleted, 'hand-1', 1_000));
    room = rooms.get('room-1')!;

    handler.handle(
      {
        ...identity,
        commandId: 'reject-vote',
        expectedVersion: room.version,
        type: 'hand-ready.set-chip-reset-vote',
        vote: 'reject',
      },
      room,
    );

    expect(handler.getHandReady('room-1')?.chipResetVote).toMatchObject({
      status: 'failed',
    });
    expect(rooms.get('room-1')?.players.map(({ chips }) => chips)).toEqual([
      100, 0,
    ]);
  });

  it('maps the Host chip recharge vote command during hand readiness', () => {
    const rooms = new InMemoryRoomRegistry();
    const handler = new RoomCommandHandler(rooms, random);
    handler.handle(createCommand(), null);
    let room = rooms.get('room-1')!;
    handler.handle(
      {
        ...identity,
        commandId: 'join',
        playerId: 'bob',
        type: 'room.join',
        nickname: 'Bob',
      },
      room,
    );
    room = rooms.get('room-1')!;
    const handReadyRoom = Object.freeze({
      ...room,
      phase: 'playing' as const,
      firstHandStarted: true,
    });
    handler.enterHandReady(beginHandReadyPhase(handReadyRoom, 'hand-1', 1_000));
    room = rooms.get('room-1')!;

    handler.handle(
      {
        ...identity,
        commandId: 'start-chip-reset-vote',
        expectedVersion: room.version,
        type: 'room.start-chip-reset-vote',
      },
      room,
    );

    expect(handler.getHandReady('room-1')?.chipResetVote?.players).toEqual([
      { playerId: 'host', vote: 'pending' },
      { playerId: 'bob', vote: 'pending' },
    ]);
  });
});
