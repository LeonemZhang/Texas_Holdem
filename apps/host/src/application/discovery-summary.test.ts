import { describe, expect, it } from 'vitest';

import { GameRuntime } from './game-runtime.js';
import { currentDiscoverySummary } from './discovery-summary.js';

describe('currentDiscoverySummary', () => {
  it('publishes the current lobby and hides a closed room', () => {
    const runtime = new GameRuntime();
    const host = runtime.create(
      {
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
      'http://10.126.126.1:32100',
    );
    expect(currentDiscoverySummary(runtime)).toMatchObject({
      roomId: host.roomId,
      hostNickname: 'Alice',
      playerCount: 1,
      phase: 'lobby',
    });
    runtime.dispatch({
      protocolVersion: '3',
      commandId: 'close-1',
      roomId: host.roomId,
      playerId: host.playerId,
      expectedVersion: runtime.snapshot(host.roomId, host.playerId)!
        .stateVersion,
      type: 'room.close',
    });
    expect(currentDiscoverySummary(runtime)).toBeNull();
    runtime.dispose();
  });
});
