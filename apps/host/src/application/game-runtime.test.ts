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
  it('lets a non-showdown player publicly reveal only their own hole cards during settlement', () => {
    const runtime = new GameRuntime();
    const context = reachHandReady(runtime);
    const guestCards = runtime.snapshot(
      context.host.roomId,
      context.guest.playerId,
    )!.game!.ownHoleCards;

    expect(
      context.send(context.guest.playerId, { type: 'game.show-hole-cards' }),
    ).toMatchObject({ status: 'accepted' });
    expect(
      runtime.snapshot(context.host.roomId, context.host.playerId)?.game
        ?.settlement?.voluntaryRevealedHoleCards,
    ).toEqual({ [context.guest.playerId]: guestCards });
    expect(() =>
      context.send(context.guest.playerId, { type: 'game.show-hole-cards' }),
    ).toThrow('already voluntarily revealed');
    runtime.dispose();
  });

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

  it('restores a voluntarily departed player with the original identity and chips', () => {
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
    const exit = runtime.dispatch({
      protocolVersion: PROTOCOL_VERSION,
      commandId: 'guest-exit',
      roomId: host.roomId,
      playerId: guest.playerId,
      expectedVersion: runtime.snapshot(host.roomId, guest.playerId)!
        .stateVersion,
      type: 'room.exit',
    });

    expect(exit.status).toBe('accepted');
    const restored = runtime.resume(
      host.roomId,
      { playerId: guest.playerId, token: guest.token },
      'http://10.126.126.1:32100',
    );

    expect(restored).toMatchObject({
      roomId: host.roomId,
      playerId: guest.playerId,
      token: guest.token,
    });
    expect(
      runtime
        .snapshot(host.roomId, host.playerId)
        ?.room.players.find(({ playerId }) => playerId === guest.playerId),
    ).toMatchObject({ seatIndex: 1, chips: 100, status: 'waiting' });
    expect(() =>
      runtime.resume(
        host.roomId,
        { playerId: guest.playerId, token: 'another-valid-looking-token' },
        'http://10.126.126.1:32100',
      ),
    ).toThrow('Recovery identity is invalid');
    runtime.dispose();
  });

  it('allows a lobby player removed by the host to recover the same identity', () => {
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
    const removed = runtime.dispatch({
      protocolVersion: PROTOCOL_VERSION,
      commandId: 'lobby-remove',
      roomId: host.roomId,
      playerId: host.playerId,
      expectedVersion: runtime.snapshot(host.roomId, host.playerId)!
        .stateVersion,
      type: 'room.remove-player',
      targetPlayerId: guest.playerId,
    });

    expect(removed).toMatchObject({ status: 'accepted' });
    expect(
      runtime
        .snapshot(host.roomId, host.playerId)
        ?.room.players.find(({ playerId }) => playerId === guest.playerId),
    ).toMatchObject({ status: 'left' });
    expect(
      runtime.resume(
        host.roomId,
        { playerId: guest.playerId, token: guest.token },
        'http://10.126.126.1:32100',
      ),
    ).toMatchObject({ playerId: guest.playerId });
    expect(
      runtime
        .snapshot(host.roomId, host.playerId)
        ?.room.players.find(({ playerId }) => playerId === guest.playerId),
    ).toMatchObject({ status: 'waiting', playerId: guest.playerId });
    runtime.dispose();
  });

  it('rejects every command and recovery attempt after an in-game removal', () => {
    const runtime = new GameRuntime();
    const context = reachHandReady(runtime);
    const beforeRemoval = runtime.snapshot(
      context.host.roomId,
      context.guest.playerId,
    )!;

    expect(
      context.send(context.host.playerId, {
        type: 'room.remove-player',
        targetPlayerId: context.guest.playerId,
      }),
    ).toMatchObject({ status: 'accepted' });

    const removed = runtime
      .snapshot(context.host.roomId, context.host.playerId)!
      .room.players.find(({ playerId }) => playerId === context.guest.playerId);
    expect(removed).toMatchObject({
      seatIndex: 1,
      chips: beforeRemoval.room.players.find(
        ({ playerId }) => playerId === context.guest.playerId,
      )?.chips,
      status: 'removed',
    });
    expect(
      runtime.dispatch({
        protocolVersion: PROTOCOL_VERSION,
        commandId: 'removed-ready',
        roomId: context.host.roomId,
        playerId: context.guest.playerId,
        expectedVersion: runtime.snapshot(
          context.host.roomId,
          context.guest.playerId,
        )!.stateVersion,
        type: 'hand-ready.set-choice',
        choice: 'ready',
      }),
    ).toMatchObject({ status: 'unauthorized' });
    expect(
      runtime.authenticate({
        protocolVersion: PROTOCOL_VERSION,
        roomId: context.host.roomId,
        playerId: context.guest.playerId,
        token: context.guest.token,
      }),
    ).toBeNull();
    expect(() =>
      runtime.resume(
        context.host.roomId,
        {
          playerId: context.guest.playerId,
          token: context.guest.token,
        },
        'http://10.126.126.1:32100',
      ),
    ).toThrow('Player was removed from this room');
    runtime.dispose();
  });

  it('retires a normally closed room so the host can immediately create another', () => {
    const runtime = new GameRuntime();
    const first = runtime.create(
      { hostNickname: 'Alice', settings },
      'http://10.126.126.1:32100',
    );
    const close = runtime.dispatch({
      protocolVersion: PROTOCOL_VERSION,
      commandId: 'close-room',
      roomId: first.roomId,
      playerId: first.playerId,
      expectedVersion: runtime.snapshot(first.roomId, first.playerId)!
        .stateVersion,
      type: 'room.close',
    });

    expect(close.status).toBe('accepted');
    expect(runtime.snapshot(first.roomId, first.playerId)?.room.phase).toBe(
      'closed',
    );
    runtime.retireClosedRoom(first.roomId);
    expect(runtime.currentRoomId()).toBeNull();
    expect(() =>
      runtime.create(
        { hostNickname: 'Alice', settings },
        'http://10.126.126.1:32100',
      ),
    ).not.toThrow();
    runtime.dispose();
  });

  it('normally closes the only running room for local replacement', () => {
    const runtime = new GameRuntime();
    const host = runtime.create(
      { hostNickname: 'Alice', settings },
      'http://10.126.126.1:32100',
    );

    expect(runtime.closeRunningRoom()).toBe(host.roomId);
    expect(runtime.snapshot(host.roomId, host.playerId)?.room.phase).toBe(
      'closed',
    );
    runtime.retireClosedRoom(host.roomId);
    expect(runtime.currentRoomId()).toBeNull();
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

  it('marks unanswered players sitting-out when the readiness deadline elapses', async () => {
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
      room: { phase: 'hand-ready', completedHands: 1 },
      handReady: {
        ownChoice: 'sitting-out',
      },
    });
    expect(
      runtime.snapshot(context.host.roomId, context.guest.playerId),
    ).toMatchObject({
      handReady: { ownChoice: 'sitting-out' },
    });
    expect(automatic).toHaveBeenCalledWith(context.host.roomId);
    runtime.dispose();
  });

  it('starts a new hand when two timed-out players rejoin preparation', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    const runtime = new GameRuntime();
    const context = reachHandReady(runtime, 1);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(
      runtime.snapshot(context.host.roomId, context.host.playerId)?.handReady
        ?.ownChoice,
    ).toBe('sitting-out');

    context.send(context.host.playerId, {
      type: 'hand-ready.set-choice',
      choice: 'ready',
    });
    expect(
      runtime.snapshot(context.host.roomId, context.host.playerId)?.room.phase,
    ).toBe('hand-ready');
    context.send(context.guest.playerId, {
      type: 'hand-ready.set-choice',
      choice: 'ready',
    });

    expect(
      runtime.snapshot(context.host.roomId, context.host.playerId),
    ).toMatchObject({ room: { phase: 'playing' }, handReady: null });
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
    expect(runtime.snapshot(host.roomId, host.playerId)?.game).toMatchObject({
      actionDeadlineMs: 2_000,
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

  it('checks instead of folding when the timed-out player can check', async () => {
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
    let commandNumber = 0;
    const send = (playerId: string, command: Record<string, unknown>) =>
      runtime.dispatch({
        protocolVersion: PROTOCOL_VERSION,
        commandId: `check-timeout-${++commandNumber}`,
        roomId: host.roomId,
        playerId,
        expectedVersion: runtime.snapshot(host.roomId, playerId)!.stateVersion,
        ...command,
      });
    send(host.playerId, { type: 'room.set-lobby-ready', ready: true });
    send(guest.playerId, { type: 'room.set-lobby-ready', ready: true });
    send(host.playerId, {
      type: 'room.start-first-hand',
      handId: 'check-timeout-hand',
    });
    const firstActor = runtime.snapshot(host.roomId, host.playerId)!.game!
      .currentActorId!;
    send(firstActor, { type: 'game.call' });
    const beforeTimeout = runtime.snapshot(host.roomId, host.playerId)!;
    expect(beforeTimeout.game?.street).toBe('preflop');
    const timedOutActorId = beforeTimeout.game!.currentActorId!;
    expect(
      runtime.snapshot(host.roomId, timedOutActorId)?.game?.legalActions,
    ).toMatchObject({ canCheck: true });

    await vi.advanceTimersByTimeAsync(1_000);

    expect(runtime.snapshot(host.roomId, host.playerId)?.game).toMatchObject({
      street: 'flop',
      actionDeadlineMs: 3_000,
    });
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
    const recoveredHost = recovered.createRecoveredHostSession(
      'http://10.126.126.1:32100',
    );
    const after = recovered.snapshot(
      recoveredHost.roomId,
      recoveredHost.playerId,
    );
    expect(recoveredHost.playerId).toBe(context.host.playerId);
    expect(
      recovered.sessions.authenticate({
        protocolVersion: PROTOCOL_VERSION,
        roomId: recoveredHost.roomId,
        playerId: recoveredHost.playerId,
        token: recoveredHost.token,
      }),
    ).toEqual({
      roomId: recoveredHost.roomId,
      playerId: recoveredHost.playerId,
    });
    expect(after?.room.completedHands).toBe(1);
    expect(after?.statistics).toEqual(before.statistics);
    recovered.dispose();
  });
});
