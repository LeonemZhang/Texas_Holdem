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

function reachFlopUncontestedHandReady(runtime: GameRuntime) {
  const host = runtime.create(
    { hostNickname: 'Alice', settings },
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
      commandId: `flop-command-${++commandNumber}`,
      roomId: host.roomId,
      playerId,
      expectedVersion: runtime.snapshot(host.roomId, playerId)!.stateVersion,
      ...command,
    });
  send(host.playerId, { type: 'room.set-lobby-ready', ready: true });
  send(guest.playerId, { type: 'room.set-lobby-ready', ready: true });
  send(host.playerId, { type: 'room.start-first-hand', handId: 'flop-hand' });
  let actorId = runtime.snapshot(host.roomId, host.playerId)!.game!
    .currentActorId!;
  send(actorId, { type: 'game.call' });
  actorId = runtime.snapshot(host.roomId, host.playerId)!.game!.currentActorId!;
  send(actorId, { type: 'game.check' });
  expect(runtime.snapshot(host.roomId, host.playerId)!.game?.street).toBe(
    'flop',
  );
  actorId = runtime.snapshot(host.roomId, host.playerId)!.game!.currentActorId!;
  send(actorId, { type: 'game.fold' });
  expect(runtime.snapshot(host.roomId, host.playerId)?.room.phase).toBe(
    'hand-ready',
  );
  return {
    host,
    guest,
    send,
    winnerId: actorId === host.playerId ? guest.playerId : host.playerId,
  };
}

function reachShowdownWithFoldedPlayerReady(runtime: GameRuntime) {
  const host = runtime.create(
    { hostNickname: 'Alice', settings },
    'http://10.126.126.1:32100',
  );
  const folded = runtime.join(
    host.roomId,
    { nickname: 'Bob' },
    'http://10.126.126.1:32100',
  );
  const third = runtime.join(
    host.roomId,
    { nickname: 'Carol' },
    'http://10.126.126.1:32100',
  );
  let commandNumber = 0;
  const send = (playerId: string, command: Record<string, unknown>) =>
    runtime.dispatch({
      protocolVersion: PROTOCOL_VERSION,
      commandId: `showdown-command-${++commandNumber}`,
      roomId: host.roomId,
      playerId,
      expectedVersion: runtime.snapshot(host.roomId, playerId)!.stateVersion,
      ...command,
    });
  send(host.playerId, { type: 'room.set-lobby-ready', ready: true });
  send(folded.playerId, { type: 'room.set-lobby-ready', ready: true });
  send(third.playerId, { type: 'room.set-lobby-ready', ready: true });
  send(host.playerId, {
    type: 'room.start-first-hand',
    handId: 'showdown-with-folded-hand',
  });

  let foldedPlayer = false;
  for (let actionNumber = 0; actionNumber < 100; actionNumber += 1) {
    const current = runtime.snapshot(host.roomId, host.playerId)!;
    if (current.room.phase === 'hand-ready') break;
    const actorId = current.game?.currentActorId;
    if (!actorId) throw new Error('Showdown hand has no current actor');
    if (!foldedPlayer && actorId === folded.playerId) {
      send(actorId, { type: 'game.fold' });
      foldedPlayer = true;
      continue;
    }
    const actorSnapshot = runtime.snapshot(host.roomId, actorId)!;
    const legalActions = actorSnapshot.game?.legalActions;
    const action = legalActions?.canCheck
      ? 'game.check'
      : typeof legalActions?.callAmount === 'number'
        ? 'game.call'
        : 'game.all-in';
    send(actorId, { type: action });
  }

  const settled = runtime.snapshot(host.roomId, host.playerId)!;
  expect(foldedPlayer).toBe(true);
  expect(settled.room.phase).toBe('hand-ready');
  expect(settled.game?.settlement?.reason).toBe('showdown');
  return { host, folded, send };
}

describe('GameRuntime', () => {
  it('keeps a hand-ready late joiner out of the settled hand until the next hand', () => {
    const runtime = new GameRuntime();
    const { host, guest, send } = reachHandReady(runtime);
    const settled = runtime.snapshot(host.roomId, host.playerId)!;
    const settledHandId = settled.game?.handId;

    const late = runtime.join(
      host.roomId,
      { nickname: 'Carol' },
      'http://10.126.126.1:32100',
    );
    const lateSnapshot = runtime.snapshot(host.roomId, late.playerId)!;
    expect(lateSnapshot.room.players).toContainEqual(
      expect.objectContaining({
        playerId: late.playerId,
        status: 'waiting',
        chips: 100,
      }),
    );
    expect(lateSnapshot.game?.handId).toBe(settledHandId);
    expect(lateSnapshot.game?.ownHoleCards).toBeNull();
    expect(lateSnapshot.handReady?.ownChoice).toBe('pending');

    send(host.playerId, { type: 'hand-ready.set-choice', choice: 'ready' });
    send(guest.playerId, { type: 'hand-ready.set-choice', choice: 'ready' });
    expect(runtime.snapshot(host.roomId, host.playerId)?.room.phase).toBe(
      'hand-ready',
    );
    send(late.playerId, { type: 'hand-ready.set-choice', choice: 'ready' });

    const started = runtime.snapshot(host.roomId, late.playerId)!;
    expect(started.room.phase).toBe('playing');
    expect(
      started.room.players.find(({ playerId }) => playerId === late.playerId)
        ?.status,
    ).toBe('active');
    expect(started.game?.handId).not.toBe(settledHandId);
    expect(started.game?.ownHoleCards).toHaveLength(2);
  });

  it('uses a host-set current blind and grows from that level without replaying history', () => {
    const runtime = new GameRuntime();
    const { host, guest, send } = reachHandReady(runtime);

    send(host.playerId, {
      type: 'room.update-settings',
      currentSmallBlind: 20,
      settings: {
        ...settings,
        blindGrowth: {
          enabled: true,
          intervalHands: 1,
          multiplier: 3,
        },
      },
    });
    expect(runtime.snapshot(host.roomId, host.playerId)?.room).toMatchObject({
      phase: 'hand-ready',
      smallBlind: 20,
      bigBlind: 40,
      settings: { smallBlind: 1 },
    });

    send(host.playerId, {
      type: 'hand-ready.set-choice',
      choice: 'ready',
    });
    send(guest.playerId, {
      type: 'hand-ready.set-choice',
      choice: 'ready',
    });
    expect(runtime.snapshot(host.roomId, host.playerId)?.room.smallBlind).toBe(
      20,
    );

    const actorId = runtime.snapshot(host.roomId, host.playerId)!.game!
      .currentActorId!;
    send(actorId, { type: 'game.fold' });
    expect(runtime.snapshot(host.roomId, host.playerId)?.room).toMatchObject({
      phase: 'hand-ready',
      smallBlind: 60,
      bigBlind: 120,
    });
    expect(
      runtime.snapshot(host.roomId, host.playerId)?.room.settings,
    ).toMatchObject({
      smallBlind: 1,
      blindGrowth: { multiplier: 3 },
    });
  });

  it('keeps one public history record per chip action across recovery', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T10:00:00.000Z'));
    const runtime = new GameRuntime();
    const context = reachHandReady(runtime);

    vi.setSystemTime(new Date('2026-08-05T10:00:01.000Z'));
    expect(
      context.send(context.guest.playerId, {
        type: 'chips.request',
        requestId: 'request-rejected',
        targetPlayerId: context.host.playerId,
        amount: 10,
      }),
    ).toMatchObject({ status: 'accepted' });
    vi.setSystemTime(new Date('2026-08-05T10:00:02.000Z'));
    expect(
      context.send(context.host.playerId, {
        type: 'chips.reject',
        requestId: 'request-rejected',
      }),
    ).toMatchObject({ status: 'accepted' });
    vi.setSystemTime(new Date('2026-08-05T10:00:03.000Z'));
    expect(
      context.send(context.guest.playerId, {
        type: 'chips.request',
        requestId: 'request-completed',
        targetPlayerId: context.host.playerId,
        amount: 10,
      }),
    ).toMatchObject({ status: 'accepted' });
    vi.setSystemTime(new Date('2026-08-05T10:00:04.000Z'));
    expect(
      context.send(context.host.playerId, {
        type: 'chips.approve',
        requestId: 'request-completed',
        transferId: 'approved-transfer',
      }),
    ).toMatchObject({ status: 'accepted' });
    vi.setSystemTime(new Date('2026-08-05T10:00:05.000Z'));
    expect(
      context.send(context.host.playerId, {
        type: 'chips.give',
        transferId: 'direct-transfer',
        receiverPlayerId: context.guest.playerId,
        amount: 5,
      }),
    ).toMatchObject({ status: 'accepted' });

    const beforeRecovery = runtime.snapshot(
      context.host.roomId,
      context.host.playerId,
    )!;
    expect(beforeRecovery.chipRequests).toEqual([]);
    expect(beforeRecovery.chipActivity).toHaveLength(3);
    expect(beforeRecovery.chipActivity[0]).toMatchObject({
      kind: 'direct-transfer',
      transferId: 'direct-transfer',
      fromPlayerId: context.host.playerId,
      toPlayerId: context.guest.playerId,
      amount: 5,
      completedAtMs: new Date('2026-08-05T10:00:05.000Z').getTime(),
    });
    expect(beforeRecovery.chipActivity[1]).toMatchObject({
      kind: 'request',
      requestId: 'request-completed',
      status: 'completed',
      completedByPlayerId: context.host.playerId,
      createdAtMs: new Date('2026-08-05T10:00:03.000Z').getTime(),
      updatedAtMs: new Date('2026-08-05T10:00:04.000Z').getTime(),
    });
    expect(beforeRecovery.chipActivity[2]).toMatchObject({
      kind: 'request',
      requestId: 'request-rejected',
      status: 'rejected',
      rejectedByPlayerIds: [context.host.playerId],
      createdAtMs: new Date('2026-08-05T10:00:01.000Z').getTime(),
      updatedAtMs: new Date('2026-08-05T10:00:02.000Z').getTime(),
    });

    const exported = runtime.exportState(context.host.roomId)!;
    const recovered = new GameRuntime();
    recovered.restore(exported, exported.sequence);
    expect(
      recovered.snapshot(context.host.roomId, context.host.playerId)
        ?.chipActivity,
    ).toEqual(beforeRecovery.chipActivity);
    recovered.dispose();
    runtime.dispose();
  });

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

  it('adds a voluntarily revealed uncontested hand to hand peak statistics', () => {
    const runtime = new GameRuntime();
    const context = reachFlopUncontestedHandReady(runtime);
    const before = runtime.snapshot(
      context.host.roomId,
      context.host.playerId,
    )!;
    const beforeHandPeaks = before.statistics.handPeaks;
    if (!beforeHandPeaks) throw new Error('Hand peak statistics are missing');
    expect(beforeHandPeaks.players).toEqual([]);

    expect(
      context.send(context.winnerId, { type: 'game.show-hole-cards' }),
    ).toMatchObject({ status: 'accepted' });

    const after = runtime.snapshot(context.host.roomId, context.host.playerId)!;
    const revealedHandResults = after.game?.settlement?.revealedHandResults;
    if (!revealedHandResults)
      throw new Error('Revealed hand results are missing');
    const revealed = revealedHandResults.find(
      ({ playerId }) => playerId === context.winnerId,
    );
    if (!revealed) throw new Error('Revealed winner hand is missing');
    const afterHandPeaks = after.statistics.handPeaks;
    if (!afterHandPeaks) throw new Error('Hand peak statistics are missing');
    expect(afterHandPeaks.players).toContainEqual({
      playerId: context.winnerId,
      handType: revealed.handType,
      bestFiveCards: revealed.bestFiveCards,
    });
    expect(afterHandPeaks.global).toMatchObject({
      playerIds: [context.winnerId],
      bestFiveCards: revealed.bestFiveCards,
    });
    runtime.dispose();
  });

  it('does not add a folded player who reveals after a multi-player showdown', () => {
    const runtime = new GameRuntime();
    const context = reachShowdownWithFoldedPlayerReady(runtime);

    expect(
      context.send(context.folded.playerId, {
        type: 'game.show-hole-cards',
      }),
    ).toMatchObject({ status: 'accepted' });

    const after = runtime.snapshot(context.host.roomId, context.host.playerId)!;
    expect(
      after.game?.settlement?.revealedHandResults?.some(
        ({ playerId }) => playerId === context.folded.playerId,
      ),
    ).toBe(true);
    expect(
      after.statistics.handPeaks?.players.some(
        ({ playerId }) => playerId === context.folded.playerId,
      ),
    ).toBe(false);
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

  it('keeps lobby state through reseating and starts from the authoritative seat order', () => {
    const runtime = new GameRuntime();
    const host = runtime.create(
      { hostNickname: 'Alice', settings },
      'http://10.126.126.1:32100',
    );
    const bob = runtime.join(
      host.roomId,
      { nickname: 'Bob' },
      'http://10.126.126.1:32100',
    );
    const carol = runtime.join(
      host.roomId,
      { nickname: 'Carol' },
      'http://10.126.126.1:32100',
    );
    let commandNumber = 0;
    const send = (playerId: string, command: Record<string, unknown>) =>
      runtime.dispatch({
        protocolVersion: PROTOCOL_VERSION,
        commandId: `seat-command-${++commandNumber}`,
        roomId: host.roomId,
        playerId,
        expectedVersion: runtime.snapshot(host.roomId, playerId)!.stateVersion,
        ...command,
      });

    send(bob.playerId, { type: 'room.set-lobby-ready', ready: true });
    send(host.playerId, {
      type: 'room.reseat-player',
      targetPlayerId: host.playerId,
      seatIndex: 2,
    });
    send(host.playerId, {
      type: 'room.reseat-player',
      targetPlayerId: carol.playerId,
      seatIndex: 1,
    });
    const reseated = runtime.snapshot(host.roomId, host.playerId)!;
    expect(
      reseated.room.players.map(({ playerId, seatIndex, lobbyReady }) => ({
        playerId,
        seatIndex,
        lobbyReady,
      })),
    ).toEqual([
      { playerId: host.playerId, seatIndex: 2, lobbyReady: true },
      { playerId: bob.playerId, seatIndex: 0, lobbyReady: true },
      { playerId: carol.playerId, seatIndex: 1, lobbyReady: false },
    ]);
    expect(
      runtime.resume(
        host.roomId,
        { playerId: bob.playerId, token: bob.token },
        'http://10.126.126.1:32100',
      ),
    ).toMatchObject({ playerId: bob.playerId });

    send(carol.playerId, { type: 'room.set-lobby-ready', ready: true });
    send(host.playerId, {
      type: 'room.start-first-hand',
      handId: 'reseated-hand',
    });
    const started = runtime.snapshot(host.roomId, host.playerId)!;
    const clockwise = [...started.room.players].sort(
      (left, right) => left.seatIndex - right.seatIndex,
    );
    const buttonIndex = clockwise.findIndex(
      ({ playerId }) => playerId === started.game?.buttonPlayerId,
    );
    expect(started.game?.smallBlindPlayerId).toBe(
      clockwise[(buttonIndex + 1) % clockwise.length]?.playerId,
    );
    expect(started.game?.bigBlindPlayerId).toBe(
      clockwise[(buttonIndex + 2) % clockwise.length]?.playerId,
    );
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
      { playerId: guest.playerId, token: guest.token, nickname: 'Bobby' },
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
    ).toMatchObject({
      nickname: 'Bobby',
      seatIndex: 1,
      chips: 100,
      status: 'waiting',
    });
    expect(() =>
      runtime.resume(
        host.roomId,
        { playerId: guest.playerId, token: 'another-valid-looking-token' },
        'http://10.126.126.1:32100',
      ),
    ).toThrow('Recovery identity is invalid');
    runtime.dispose();
  });

  it('recovers an in-game voluntary exit as sitting out for the current hand', () => {
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
    expect(
      runtime.snapshot(context.host.roomId, context.host.playerId)?.room.phase,
    ).toBe('playing');
    const exit = context.send(context.guest.playerId, {
      type: 'room.exit',
    });

    expect(exit).toMatchObject({ status: 'accepted' });
    expect(
      runtime
        .snapshot(context.host.roomId, context.host.playerId)
        ?.room.players.find(
          ({ playerId }) => playerId === context.guest.playerId,
        ),
    ).toMatchObject({
      seatIndex: 1,
      status: 'left',
    });
    expect(() =>
      runtime.resume(
        context.host.roomId,
        {
          playerId: context.guest.playerId,
          token: context.guest.token,
          nickname: 'Guest 2',
        },
        'http://10.126.126.1:32100',
      ),
    ).toThrow('Nickname can only be changed while recovering to the lobby');
    expect(
      runtime.resume(
        context.host.roomId,
        {
          playerId: context.guest.playerId,
          token: context.guest.token,
        },
        'http://10.126.126.1:32100',
      ),
    ).toMatchObject({ playerId: context.guest.playerId });
    expect(
      runtime
        .snapshot(context.host.roomId, context.host.playerId)
        ?.room.players.find(
          ({ playerId }) => playerId === context.guest.playerId,
        ),
    ).toMatchObject({ status: 'sitting-out' });
    expect(
      runtime.snapshot(context.host.roomId, context.guest.playerId)?.game
        ?.legalActions,
    ).toBeNull();
    expect(
      context.send(context.guest.playerId, {
        type: 'game.raise-to',
        amount: 10,
      }),
    ).toMatchObject({ status: 'unauthorized' });
    runtime.dispose();
  });

  it('rejects recovery after a host removes a lobby player', () => {
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
    ).toMatchObject({ status: 'removed' });
    expect(
      runtime
        .statisticsForRoom(host.roomId)
        ?.players.find(({ playerId }) => playerId === guest.playerId),
    ).toBeUndefined();
    expect(() =>
      runtime.resume(
        host.roomId,
        { playerId: guest.playerId, token: guest.token },
        'http://10.126.126.1:32100',
      ),
    ).toThrow('Player was removed from this room');
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
      runtime.dispatch({
        protocolVersion: PROTOCOL_VERSION,
        commandId: 'removed-raise',
        roomId: context.host.roomId,
        playerId: context.guest.playerId,
        expectedVersion: runtime.snapshot(
          context.host.roomId,
          context.guest.playerId,
        )!.stateVersion,
        type: 'game.raise-to',
        amount: 10,
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
    const settledSnapshot = runtime.snapshot(
      context.host.roomId,
      context.host.playerId,
    );
    expect(settledSnapshot).toMatchObject({
      room: { phase: 'hand-ready', completedHands: 1 },
      game: { handNumber: 1 },
    });
    const settledHandId = settledSnapshot?.game?.handId;
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
      game: { street: 'preflop', handNumber: 2 },
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
    expect(snapshot?.game?.handId).not.toBe(settledHandId);
    runtime.dispose();
  });

  it('counts live all-in actions in player statistics and titles', () => {
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

    const firstActor = runtime.snapshot(
      context.host.roomId,
      context.host.playerId,
    )!.game!.currentActorId!;
    expect(context.send(firstActor, { type: 'game.all-in' })).toMatchObject({
      status: 'accepted',
    });
    const secondActor = runtime.snapshot(
      context.host.roomId,
      context.host.playerId,
    )!.game!.currentActorId!;
    expect(context.send(secondActor, { type: 'game.all-in' })).toMatchObject({
      status: 'accepted',
    });

    const snapshot = runtime.snapshot(
      context.host.roomId,
      context.host.playerId,
    )!;
    expect(
      snapshot.statistics.players.find(
        ({ playerId }) => playerId === firstActor,
      )?.actions.allIn,
    ).toBe(1);
    const allInTitle = snapshot.statistics.titles.find(
      ({ title }) => title === 'all-in-king',
    );
    expect(allInTitle?.value).toBe(1);
    expect(allInTitle?.playerIds).toEqual(
      expect.arrayContaining([firstActor, secondActor]),
    );
    runtime.dispose();
  });

  it('publishes and persists automatic runout streets at 2s/2s/2s/2s', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
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

    const firstActor = runtime.snapshot(
      context.host.roomId,
      context.host.playerId,
    )!.game!.currentActorId!;
    context.send(firstActor, { type: 'game.all-in' });
    const secondActor = runtime.snapshot(
      context.host.roomId,
      context.host.playerId,
    )!.game!.currentActorId!;
    context.send(secondActor, { type: 'game.all-in' });

    const published: Array<{
      readonly street: string | undefined;
      readonly sequence: number;
      readonly stateVersion: number;
    }> = [];
    const committed: Array<{
      readonly street: string | undefined;
      readonly sequence: number;
      readonly stateVersion: number;
    }> = [];
    runtime.onAutomaticStateChange((roomId) => {
      const snapshots = runtime.snapshotsForRoom(roomId);
      expect(snapshots).toHaveLength(2);
      const snapshot = runtime.snapshot(roomId, context.host.playerId)!;
      published.push({
        street: snapshot.game?.street,
        sequence: snapshot.sequence,
        stateVersion: snapshot.stateVersion,
      });
    });
    runtime.onStateCommitted((roomId) => {
      const state = runtime.exportState(roomId)!;
      committed.push({
        street: state.hand?.street,
        sequence: state.sequence,
        stateVersion: state.room.version,
      });
    });

    await vi.advanceTimersByTimeAsync(1_999);
    expect(
      runtime.snapshot(context.host.roomId, context.host.playerId)!.game,
    ).toMatchObject({ street: 'preflop' });
    await vi.advanceTimersByTimeAsync(1);
    expect(
      runtime.snapshot(context.host.roomId, context.host.playerId)!.game,
    ).toMatchObject({ street: 'flop' });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(
      runtime.snapshot(context.host.roomId, context.host.playerId)!.game,
    ).toMatchObject({ street: 'flop' });
    await vi.advanceTimersByTimeAsync(1);
    expect(
      runtime.snapshot(context.host.roomId, context.host.playerId)!.game,
    ).toMatchObject({ street: 'turn' });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(
      runtime.snapshot(context.host.roomId, context.host.playerId)!.game,
    ).toMatchObject({ street: 'river' });
    await vi.advanceTimersByTimeAsync(1_999);
    expect(
      runtime.snapshot(context.host.roomId, context.host.playerId)!.room.phase,
    ).toBe('playing');
    await vi.advanceTimersByTimeAsync(1);

    expect(published.map(({ street }) => street)).toEqual([
      'flop',
      'turn',
      'river',
      'river',
    ]);
    expect(committed.map(({ street }) => street)).toEqual([
      'flop',
      'turn',
      'river',
      'river',
    ]);
    expect(published.map(({ sequence }) => sequence)).toEqual(
      [...published.map(({ sequence }) => sequence)].sort((a, b) => a - b),
    );
    expect(committed.map(({ stateVersion }) => stateVersion)).toEqual(
      [...committed.map(({ stateVersion }) => stateVersion)].sort(
        (a, b) => a - b,
      ),
    );
    expect(
      runtime.snapshot(context.host.roomId, context.host.playerId),
    ).toMatchObject({
      room: { phase: 'hand-ready' },
      game: { street: 'river' },
    });
    runtime.dispose();
  });

  it('does not start runout while another player still has a legal response', async () => {
    vi.useFakeTimers();
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
    const firstActor = runtime.snapshot(
      context.host.roomId,
      context.host.playerId,
    )!.game!.currentActorId!;
    context.send(firstActor, { type: 'game.all-in' });
    const waitingSnapshot = runtime.snapshot(
      context.host.roomId,
      context.host.playerId,
    )!;
    expect(waitingSnapshot.game?.currentActorId).not.toBeNull();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(
      runtime.snapshot(context.host.roomId, context.host.playerId)!.game,
    ).toMatchObject({ street: 'preflop' });

    context.send(waitingSnapshot.game!.currentActorId!, {
      type: 'game.all-in',
    });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(
      runtime.snapshot(context.host.roomId, context.host.playerId)!.game,
    ).toMatchObject({ street: 'flop' });
    runtime.dispose();
  });

  it('resumes automatic runout from the persisted current street without replay', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
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
    const firstActor = runtime.snapshot(
      context.host.roomId,
      context.host.playerId,
    )!.game!.currentActorId!;
    context.send(firstActor, { type: 'game.all-in' });
    const secondActor = runtime.snapshot(
      context.host.roomId,
      context.host.playerId,
    )!.game!.currentActorId!;
    context.send(secondActor, { type: 'game.all-in' });

    await vi.advanceTimersByTimeAsync(2_000);
    const persisted = runtime.exportState(context.host.roomId)!;
    expect(persisted.hand?.street).toBe('flop');
    const sequence = persisted.sequence;
    runtime.dispose();

    const recovered = new GameRuntime();
    recovered.restore(persisted, sequence);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(
      recovered.snapshot(context.host.roomId, context.host.playerId)!.game,
    ).toMatchObject({ street: 'flop' });
    await vi.advanceTimersByTimeAsync(1);
    expect(
      recovered.snapshot(context.host.roomId, context.host.playerId)!.game,
    ).toMatchObject({ street: 'turn' });
    recovered.dispose();
  });

  it('clears automatic runout timers across pause, close, and dispose', async () => {
    vi.useFakeTimers();
    const pausedRuntime = new GameRuntime();
    const paused = reachHandReady(pausedRuntime);
    paused.send(paused.host.playerId, {
      type: 'hand-ready.set-choice',
      choice: 'ready',
    });
    paused.send(paused.guest.playerId, {
      type: 'hand-ready.set-choice',
      choice: 'ready',
    });
    let actorId = pausedRuntime.snapshot(
      paused.host.roomId,
      paused.host.playerId,
    )!.game!.currentActorId!;
    paused.send(actorId, { type: 'game.all-in' });
    actorId = pausedRuntime.snapshot(paused.host.roomId, paused.host.playerId)!
      .game!.currentActorId!;
    paused.send(actorId, { type: 'game.all-in' });
    paused.send(paused.host.playerId, { type: 'room.pause' });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(
      pausedRuntime.snapshot(paused.host.roomId, paused.host.playerId),
    ).toMatchObject({ room: { phase: 'paused' }, game: { street: 'preflop' } });
    paused.send(paused.host.playerId, { type: 'room.resume' });
    await vi.advanceTimersByTimeAsync(2_000);
    expect(
      pausedRuntime.snapshot(paused.host.roomId, paused.host.playerId)!.game,
    ).toMatchObject({ street: 'flop' });
    pausedRuntime.dispose();

    const closedRuntime = new GameRuntime();
    const closed = reachHandReady(closedRuntime);
    closed.send(closed.host.playerId, {
      type: 'hand-ready.set-choice',
      choice: 'ready',
    });
    closed.send(closed.guest.playerId, {
      type: 'hand-ready.set-choice',
      choice: 'ready',
    });
    actorId = closedRuntime.snapshot(closed.host.roomId, closed.host.playerId)!
      .game!.currentActorId!;
    closed.send(actorId, { type: 'game.all-in' });
    actorId = closedRuntime.snapshot(closed.host.roomId, closed.host.playerId)!
      .game!.currentActorId!;
    closed.send(actorId, { type: 'game.all-in' });
    closed.send(closed.host.playerId, { type: 'room.close' });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(
      closedRuntime.snapshot(closed.host.roomId, closed.host.playerId)!.room,
    ).toMatchObject({ phase: 'closed' });
    closedRuntime.dispose();

    const disposedRuntime = new GameRuntime();
    const disposed = reachHandReady(disposedRuntime);
    disposed.send(disposed.host.playerId, {
      type: 'hand-ready.set-choice',
      choice: 'ready',
    });
    disposed.send(disposed.guest.playerId, {
      type: 'hand-ready.set-choice',
      choice: 'ready',
    });
    actorId = disposedRuntime.snapshot(
      disposed.host.roomId,
      disposed.host.playerId,
    )!.game!.currentActorId!;
    disposed.send(actorId, { type: 'game.all-in' });
    actorId = disposedRuntime.snapshot(
      disposed.host.roomId,
      disposed.host.playerId,
    )!.game!.currentActorId!;
    disposed.send(actorId, { type: 'game.all-in' });
    disposedRuntime.dispose();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(
      disposedRuntime.snapshot(disposed.host.roomId, disposed.host.playerId)!
        .game,
    ).toMatchObject({ street: 'preflop' });
  });

  it('counts a heads-up loss after other players fold before showdown', async () => {
    vi.useFakeTimers();
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
    const folded = runtime.join(
      host.roomId,
      { nickname: 'Carol' },
      'http://10.126.126.1:32100',
    );
    let commandNumber = 0;
    const send = (playerId: string, command: Record<string, unknown>) =>
      runtime.dispatch({
        protocolVersion: PROTOCOL_VERSION,
        commandId: `three-player-${++commandNumber}`,
        roomId: host.roomId,
        playerId,
        expectedVersion: runtime.snapshot(host.roomId, playerId)!.stateVersion,
        ...command,
      });
    send(host.playerId, { type: 'room.set-lobby-ready', ready: true });
    send(guest.playerId, { type: 'room.set-lobby-ready', ready: true });
    send(folded.playerId, { type: 'room.set-lobby-ready', ready: true });
    send(host.playerId, {
      type: 'room.start-first-hand',
      handId: 'three-player-hand',
    });

    while (
      runtime.snapshot(host.roomId, host.playerId)!.room.phase === 'playing'
    ) {
      const actor = runtime.snapshot(host.roomId, host.playerId)!.game!
        .currentActorId;
      if (!actor) break;
      send(actor, {
        type: actor === folded.playerId ? 'game.fold' : 'game.all-in',
      });
    }

    await vi.advanceTimersByTimeAsync(8_000);

    const title = runtime
      .snapshot(host.roomId, host.playerId)!
      .statistics.titles.find(({ title }) => title === 'unlucky-player');
    expect(title).toMatchObject({ value: 1, playerIds: expect.any(Array) });
    expect(title?.playerIds).toHaveLength(1);
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

  it('keeps the current action deadline when the host changes the next timeout', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
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
    let commandNumber = 0;
    const send = (playerId: string, command: Record<string, unknown>) =>
      runtime.dispatch({
        protocolVersion: PROTOCOL_VERSION,
        commandId: `settings-deadline-${++commandNumber}`,
        roomId: host.roomId,
        playerId,
        expectedVersion: runtime.snapshot(host.roomId, playerId)!.stateVersion,
        ...command,
      });
    send(host.playerId, { type: 'room.set-lobby-ready', ready: true });
    send(guest.playerId, { type: 'room.set-lobby-ready', ready: true });
    send(host.playerId, {
      type: 'room.start-first-hand',
      handId: 'settings-deadline-hand',
    });
    const before = runtime.snapshot(host.roomId, host.playerId)!;
    send(host.playerId, {
      type: 'room.update-settings',
      settings: { ...settings, actionTimeoutSeconds: 1 },
    });
    expect(
      runtime.snapshot(host.roomId, host.playerId)?.game?.actionDeadlineMs,
    ).toBe(before.game?.actionDeadlineMs);
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

  it('uses the normal timeout action for a player who left during the hand', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
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

    let actorId = runtime.snapshot(context.host.roomId, context.host.playerId)!
      .game!.currentActorId!;
    if (actorId === context.host.playerId) {
      expect(context.send(actorId, { type: 'game.call' })).toMatchObject({
        status: 'accepted',
      });
      actorId = runtime.snapshot(context.host.roomId, context.host.playerId)!
        .game!.currentActorId!;
    }
    expect(actorId).toBe(context.guest.playerId);
    expect(
      context.send(context.guest.playerId, { type: 'room.exit' }),
    ).toMatchObject({ status: 'accepted' });

    const automatic = vi.fn();
    runtime.onAutomaticStateChange(automatic);
    await vi.advanceTimersByTimeAsync(30_000);

    const afterTimeout = runtime.snapshot(
      context.host.roomId,
      context.host.playerId,
    )!;
    expect(
      afterTimeout.room.players.find(
        ({ playerId }) => playerId === context.guest.playerId,
      ),
    ).toMatchObject({ status: 'left' });
    expect(
      afterTimeout.room.phase === 'hand-ready' ||
        afterTimeout.game?.currentActorId !== context.guest.playerId,
    ).toBe(true);
    expect(automatic).toHaveBeenCalledWith(context.host.roomId);
    runtime.dispose();
  });

  it('restores completed hands and full statistics from the injected fact store', () => {
    const summaries: HandSummaryEvent[] = [];
    const facts: StatisticsFactEvent[] = [];
    const store: StatisticsFactStorePort = {
      saveSummary: (_roomId, _sequence, summary) => summaries.push(summary),
      updateSummary: (_roomId, summary) => {
        const index = summaries.findIndex(
          ({ handId }) => handId === summary.handId,
        );
        if (index >= 0) summaries[index] = summary;
      },
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
    expect(before.game?.handNumber).toBe(1);
    expect(after?.game?.handNumber).toBe(1);
    expect(after?.statistics).toEqual(before.statistics);
    recovered.dispose();
  });

  it('keeps unfinished-hand action facts in a recovery snapshot', () => {
    const summaries: HandSummaryEvent[] = [];
    const facts: StatisticsFactEvent[] = [];
    const store: StatisticsFactStorePort = {
      saveSummary: (_roomId, _sequence, summary) => summaries.push(summary),
      updateSummary: (_roomId, summary) => {
        const index = summaries.findIndex(
          ({ handId }) => handId === summary.handId,
        );
        if (index >= 0) summaries[index] = summary;
      },
      saveFacts: (_roomId, stored: readonly StoredStatisticsFact[]) =>
        facts.push(...stored.map(({ event }) => event)),
      loadSummaries: () => summaries,
      loadFacts: () => facts,
    };
    const runtime = new GameRuntime({ statisticsStore: store });
    const context = reachHandReady(runtime);
    context.send(context.host.playerId, {
      type: 'hand-ready.set-choice',
      choice: 'ready',
    });
    context.send(context.guest.playerId, {
      type: 'hand-ready.set-choice',
      choice: 'ready',
    });
    const actorId = runtime.snapshot(
      context.host.roomId,
      context.host.playerId,
    )!.game!.currentActorId!;
    context.send(actorId, { type: 'game.call' });
    const before = runtime.snapshot(
      context.host.roomId,
      context.host.playerId,
    )!;
    const exported = runtime.exportState(context.host.roomId)!;
    expect(exported.pendingStatisticsFacts).toHaveLength(1);
    runtime.dispose();

    const recovered = new GameRuntime({ statisticsStore: store });
    recovered.restore(exported, exported.sequence);
    const after = recovered.snapshot(
      context.host.roomId,
      context.host.playerId,
    )!;
    expect(after.statistics).toEqual(before.statistics);
    recovered.dispose();
  });
});
