import { describe, expect, it } from 'vitest';

import { joinRoom } from './join-room.js';
import {
  eliminateZeroChipPlayers,
  leaveRoom,
  removePlayer,
  sitOutPlayerForHand,
} from './player-status.js';
import { createRoom } from './room.js';

function room(policy: 'request-chips' | 'eliminate' = 'request-chips') {
  const state = createRoom({
    roomId: 'room',
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
      zeroChipPolicy: policy,
    },
  });
  return joinRoom(state, { playerId: 'bob', nickname: 'Bob' });
}

function serviceOnlyRoom() {
  const state = createRoom({
    roomId: 'room',
    hostId: 'host-manager',
    hostParticipation: 'service-only',
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
  return joinRoom(state, { playerId: 'bob', nickname: 'Bob' });
}

describe('room player statuses', () => {
  it('retains a voluntarily leaving player history but releases participation', () => {
    const left = leaveRoom(room(), 'bob');
    expect(left.players).toHaveLength(2);
    expect(left.players[1]).toMatchObject({
      playerId: 'bob',
      status: 'left',
      chips: 100,
    });
  });

  it('keeps an in-game voluntary exit recoverable as left', () => {
    const started = Object.freeze({
      ...room(),
      phase: 'playing' as const,
      firstHandStarted: true,
    });

    const left = leaveRoom(started, 'bob');

    expect(left.players[1]).toMatchObject({
      playerId: 'bob',
      seatIndex: 1,
      status: 'left',
    });
  });

  it('keeps one-hand sitting out distinct from leaving and elimination', () => {
    const sittingOut = sitOutPlayerForHand(room(), 'bob');
    expect(sittingOut.players[1]?.status).toBe('sitting-out');
  });

  it('eliminates zero-chip players only under the eliminate policy', () => {
    const withZero = (policy: 'request-chips' | 'eliminate') => {
      const state = room(policy);
      return Object.freeze({
        ...state,
        players: Object.freeze(
          state.players.map((player) =>
            Object.freeze({
              ...player,
              chips: player.playerId === 'bob' ? 0 : player.chips,
            }),
          ),
        ),
      });
    };
    expect(
      eliminateZeroChipPlayers(withZero('request-chips')).players[1]?.status,
    ).toBe('waiting');
    expect(
      eliminateZeroChipPlayers(withZero('eliminate')).players[1]?.status,
    ).toBe('eliminated');
  });

  it('forbids the host from abandoning host identity through ordinary exit', () => {
    expect(() => leaveRoom(room(), 'host')).toThrow(
      'The host must close the room instead of leaving',
    );
  });

  it('records a host kick as removed even before the first hand', () => {
    const removed = removePlayer(room(), 'host', 'bob');
    expect(removed.players[1]).toMatchObject({
      playerId: 'bob',
      status: 'removed',
      lobbyReady: false,
    });
    expect(() => removePlayer(room(), 'bob', 'host')).toThrow(
      'Only the host can remove a player',
    );
    expect(() =>
      removePlayer({ ...room(), phase: 'playing' }, 'host', 'bob'),
    ).toThrow('Players can only be removed between hands');
  });

  it('permanently removes a player between hands after play has started', () => {
    const started = Object.freeze({
      ...room(),
      phase: 'hand-ready' as const,
      firstHandStarted: true,
    });

    const removed = removePlayer(started, 'host', 'bob');

    expect(removed.players[1]).toMatchObject({
      playerId: 'bob',
      seatIndex: 1,
      chips: 100,
      status: 'removed',
      lobbyReady: false,
    });
    expect(() => removePlayer(removed, 'host', 'bob')).toThrow(
      'Player cannot be removed',
    );
  });

  it('keeps service-only host identity outside player status operations', () => {
    const state = serviceOnlyRoom();
    expect(() => leaveRoom(state, 'host-manager')).toThrow(
      'The host must close the room instead of leaving',
    );
    const removed = removePlayer(state, 'host-manager', 'bob');
    expect(removed.players[0]).toMatchObject({
      playerId: 'bob',
      status: 'removed',
    });
    expect(() => removePlayer(state, 'bob', 'host-manager')).toThrow(
      'Only the host can remove a player',
    );
  });
});
