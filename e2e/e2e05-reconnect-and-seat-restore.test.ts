import { describe, expect, it } from 'vitest';

import {
  PROTOCOL_VERSION,
  type PlayerSnapshot,
} from '../packages/protocol/src/index.js';

import {
  ReconnectSessionStore,
  type KeyValueStorage,
} from '../apps/client/src/connection/reconnect-session-store.js';
import { InMemoryEventBuffer } from '../apps/host/src/application/event-buffer.js';
import { ReconnectSynchronizer } from '../apps/host/src/application/reconnect-synchronizer.js';
import { InMemorySessionAuthenticator } from '../apps/host/src/application/session-authenticator.js';
import { joinRoom } from '../apps/host/src/domain/join-room.js';
import {
  createReconnectRegistry,
  markPlayerDisconnected,
  reconnectPlayer,
} from '../apps/host/src/domain/reconnect.js';
import { createRoom, type RoomState } from '../apps/host/src/domain/room.js';

class MemoryStorage implements KeyValueStorage {
  readonly #values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.#values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.#values.set(key, value);
  }

  removeItem(key: string): void {
    this.#values.delete(key);
  }
}

function createPlayingRoom(): RoomState {
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
  return Object.freeze({
    ...room,
    phase: 'playing' as const,
    firstHandStarted: true,
    players: Object.freeze(
      room.players.map((player) =>
        Object.freeze({
          ...player,
          chips: player.playerId === 'bob' ? 73 : player.chips,
          status: 'active' as const,
        }),
      ),
    ),
  });
}

function snapshot(
  room: RoomState,
  playerId: string,
  sequence: number,
): PlayerSnapshot {
  return {
    protocolVersion: PROTOCOL_VERSION,
    roomId: room.roomId,
    playerId,
    sequence,
    stateVersion: room.version,
    room: {
      roomName: room.settings.roomName,
      phase: room.phase,
      smallBlind: 1,
      bigBlind: 2,
      completedHands: 1,
      players: room.players.map((player) => ({
        playerId: player.playerId,
        nickname: player.nickname,
        seatIndex: player.seatIndex,
        chips: player.chips,
        status: player.status,
        isHost: player.playerId === room.hostPlayerId,
        lobbyReady: player.lobbyReady,
      })),
    },
    game: null,
    handReady: null,
    statistics: { players: [], titles: [] },
  };
}

function appendControlEvent(events: InMemoryEventBuffer, id: number): void {
  events.append([
    {
      protocolVersion: PROTOCOL_VERSION,
      eventId: `event-${id}`,
      roomId: 'room-1',
      stateVersion: id,
      type: 'room.control-changed',
      phase: 'playing',
    },
  ]);
}

describe('E2E05 reconnect and seat restoration', () => {
  it('restores the saved identity, original seat and a full snapshot after an event gap', () => {
    const token = 'bob-reconnect-token-123456';
    const storage = new MemoryStorage();
    new ReconnectSessionStore(storage).save({
      protocolVersion: PROTOCOL_VERSION,
      roomId: 'room-1',
      playerId: 'bob',
      token,
      joinUrl: 'http://10.126.126.1:4173/room/room-1',
    });

    const original = createPlayingRoom();
    const registry = createReconnectRegistry(original, {
      host: 'host-reconnect-token-123456',
      bob: token,
    });
    const disconnected = markPlayerDisconnected(original, registry, 'bob');
    expect(disconnected.room.players).toHaveLength(2);
    expect(disconnected.room.players[1]).toMatchObject({
      playerId: 'bob',
      seatIndex: 1,
      chips: 73,
      status: 'disconnected',
    });

    const refreshedSession = new ReconnectSessionStore(storage).load('room-1');
    expect(refreshedSession).not.toBeNull();
    const sessions = new InMemorySessionAuthenticator();
    sessions.register({ roomId: 'room-1', playerId: 'bob' }, token);
    const identity = sessions.authenticate({
      protocolVersion: PROTOCOL_VERSION,
      roomId: refreshedSession!.roomId,
      playerId: refreshedSession!.playerId,
      token: refreshedSession!.token,
    });
    expect(identity).toEqual({ roomId: 'room-1', playerId: 'bob' });

    const restored = reconnectPlayer(
      disconnected.room,
      disconnected.registry,
      refreshedSession!.token,
    );
    expect(restored.players[1]).toMatchObject({
      playerId: 'bob',
      nickname: 'Bob',
      seatIndex: 1,
      chips: 73,
      status: 'active',
    });

    const events = new InMemoryEventBuffer(1);
    appendControlEvent(events, 1);
    appendControlEvent(events, 2);
    const synchronizer = new ReconnectSynchronizer(
      events,
      (roomId, playerId, sequence) =>
        roomId === restored.roomId
          ? snapshot(restored, playerId, sequence)
          : null,
    );
    const response = synchronizer.synchronize(identity!, {
      protocolVersion: PROTOCOL_VERSION,
      roomId: 'room-1',
      playerId: 'bob',
      offset: 0,
    });

    expect(response).toMatchObject({
      status: 'snapshot',
      latestSequence: 2,
      snapshot: {
        playerId: 'bob',
        sequence: 2,
        room: {
          players: expect.arrayContaining([
            expect.objectContaining({
              playerId: 'bob',
              seatIndex: 1,
              chips: 73,
              status: 'active',
            }),
          ]),
        },
      },
    });
  });
});
