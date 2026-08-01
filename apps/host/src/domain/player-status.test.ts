import { describe, expect, it } from 'vitest';

import { joinRoom } from './join-room.js';
import {
  eliminateZeroChipPlayers,
  leaveRoom,
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
});
