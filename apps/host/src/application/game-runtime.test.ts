import { afterEach, describe, expect, it, vi } from 'vitest';

import { PROTOCOL_VERSION } from '@texas-holdem/protocol';
import type { HandSummaryEvent } from '@texas-holdem/poker-core';

import { GameRuntime } from './game-runtime.js';
import type {
  StatisticsFactStorePort,
  StoredStatisticsFact,
} from './statistics-store.js';
import type { StatisticsFactEvent } from '../statistics/fact-statistics.js';

const settings = {
  roomName: 'Friends',
  maxPlayers: 10,
  initialChips: 100,
  smallBlind: 1,
  actionTimeoutSeconds: 30,
  handReadyTimeoutSeconds: 30,
  blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
  zeroChipPolicy: 'request-chips' as const,
};

afterEach(() => vi.useRealTimers());

function reachHandReady(runtime: GameRuntime, handReadyTimeoutSeconds = 30) {
  const host = runtime.create(
    {
      hostNickname: 'Alice',
      settings: { ...settings, handReadyTimeoutSeconds },
    },
    'http://10.126.126.1:32100',
  );
  const guest = runtime.join(
    host.roomId,
    { nickname: 'Bob' },
    'http://10.126.126.1:32100',
  );
  let commandNumber = 0;
  const send = (playerId: string, command: Record<string, unknown>) =>
    runtime.dispatch({
      protocolVersion: PROTOCOL_VERSION,
      commandId: `command-${++commandNumber}`,
      roomId: host.roomId,
      playerId,
      expectedVersion: runtime.snapshot(host.roomId, playerId)!.stateVersion,
      ...command,
    });
  send(host.playerId, { type: 'room.set-lobby-ready', ready: true });
  send(guest.playerId, { type: 'room.set-lobby-ready', ready: true });
  send(host.playerId, { type: 'room.start-first-hand', handId: 'hand-1' });
  const actorId = runtime.snapshot(host.roomId, host.playerId)!.game!
    .currentActorId!;
  send(actorId, { type: 'game.fold' });
  expect(runtime.snapshot(host.roomId, host.playerId)?.room.phase).toBe(
    'hand-ready',
  );
  return { host, guest, send };
}

describe('GameRuntime', () => {
  it('creates authenticated host and guest sessions and projects command updates', () => {
    const runtime = new GameRuntime();
    const host = runtime.create(
      { hostNickname: 'Alice', settings },
      'http://10.126.126.1:32100',
    );
    const guest = runtime.join(
      host.roomId,
      { nickname: 'Bob' },
      'http://10.126.126.1:32100',
    );

    expect(host.joinUrl).toContain(`room=${host.roomId}`);
    expect(
      runtime.sessions.authenticate({
        protocolVersion: PROTOCOL_VERSION,
        roomId: guest.roomId,
        playerId: guest.playerId,
        token: guest.token,
      }),
    ).toEqual({ roomId: guest.roomId, playerId: guest.playerId });
    expect(
      runtime.snapshot(host.roomId, host.playerId)?.room.players,
    ).toHaveLength(2);

    const before = runtime.snapshot(host.roomId, guest.playerId)!;
    const ready = runtime.dispatch({
      protocolVersion: PROTOCOL_VERSION,
      commandId: 'ready-1',
      roomId: guest.roomId,
      playerId: guest.playerId,
      expectedVersion: before.stateVersion,
      type: 'room.set-lobby-ready',
      ready: true,
    });
    expect(ready.status).toBe('accepted');
    expect(
      runtime
        .snapshot(host.roomId, host.playerId)
        ?.room.players.find(({ playerId }) => playerId === guest.playerId),
    ).toMatchObject({ lobbyReady: true });
    runtime.dispose();
  });

  it('starts the next hand immediately when every player becomes ready', () => {
    const runtime = new GameRuntime();
    const context = reachHandReady(runtime);
    context.send(context.host.playerId, {
      type: 'hand-ready.set-choice',
      choice: 'ready',
    });
    context.send(context.guest.playerId, {
      type: 'hand-ready.set-choice',
      choice: 'ready',
    });

    const snapshot = runtime.snapshot(
      context.host.roomId,
      context.host.playerId,
    );
    expect(snapshot).toMatchObject({
      room: { phase: 'playing', completedHands: 1 },
      game: { street: 'preflop' },
      handReady: null,
      statistics: {
        players: expect.arrayContaining([
          expect.objectContaining({ participatedHands: 1 }),
        ]),
        titles: expect.arrayContaining([
          expect.objectContaining({ title: 'pot-harvester' }),
          expect.objectContaining({ title: 'bluff-king' }),
        ]),
      },
    });
    expect(snapshot?.game?.handId).not.toBe('hand-1');
    runtime.dispose();
  });

  it('normalizes readiness and starts automatically when the deadline elapses', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const runtime = new GameRuntime();
    const context = reachHandReady(runtime, 1);
    const automatic = vi.fn();
    runtime.onAutomaticStateChange(automatic);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(
      runtime.snapshot(context.host.roomId, context.host.playerId),
    ).toMatchObject({
      room: { phase: 'playing', completedHands: 1 },
      handReady: null,
    });
    expect(automatic).toHaveBeenCalledWith(context.host.roomId);
    runtime.dispose();
  });

  it('folds a player who does not act before the configured turn deadline', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const runtime = new GameRuntime();
    const host = runtime.create(
      {
        hostNickname: 'Alice',
        settings: { ...settings, actionTimeoutSeconds: 1 },
      },
      'http://10.126.126.1:32100',
    );
    const guest = runtime.join(
      host.roomId,
      { nickname: 'Bob' },
      'http://10.126.126.1:32100',
    );
    const send = (playerId: string, command: Record<string, unknown>) =>
      runtime.dispatch({
        protocolVersion: PROTOCOL_VERSION,
        commandId: crypto.randomUUID(),
        roomId: host.roomId,
        playerId,
        expectedVersion: runtime.snapshot(host.roomId, playerId)!.stateVersion,
        ...command,
      });
    send(host.playerId, { type: 'room.set-lobby-ready', ready: true });
    send(guest.playerId, { type: 'room.set-lobby-ready', ready: true });
    send(host.playerId, {
      type: 'room.start-first-hand',
      handId: 'timed-hand',
    });
    const automatic = vi.fn();
    runtime.onAutomaticStateChange(automatic);

    await vi.advanceTimersByTimeAsync(1_000);

    expect(runtime.snapshot(host.roomId, host.playerId)).toMatchObject({
      room: { phase: 'hand-ready', completedHands: 1 },
    });
    expect(automatic).toHaveBeenCalledWith(host.roomId);
    runtime.dispose();
  });

  it('restores completed hands and full statistics from the injected fact store', () => {
    const summaries: HandSummaryEvent[] = [];
    const facts: StatisticsFactEvent[] = [];
    const store: StatisticsFactStorePort = {
      saveSummary: (_roomId, _sequence, summary) => summaries.push(summary),
      saveFacts: (_roomId, stored: readonly StoredStatisticsFact[]) =>
        facts.push(...stored.map(({ event }) => event)),
      loadSummaries: () => summaries,
      loadFacts: () => facts,
    };
    const runtime = new GameRuntime({ statisticsStore: store });
    const context = reachHandReady(runtime);
    const before = runtime.snapshot(
      context.host.roomId,
      context.host.playerId,
    )!;
    const exported = runtime.exportState(context.host.roomId)!;
    expect(before.room.completedHands).toBe(1);
    expect(
      before.statistics.players.some(({ actions }) => actions.fold === 1),
    ).toBe(true);
    runtime.dispose();

    const recovered = new GameRuntime({ statisticsStore: store });
    recovered.restore(exported, exported.sequence);
    const after = recovered.snapshot(
      context.host.roomId,
      context.host.playerId,
    );
    expect(after?.room.completedHands).toBe(1);
    expect(after?.statistics).toEqual(before.statistics);
    recovered.dispose();
  });
});
