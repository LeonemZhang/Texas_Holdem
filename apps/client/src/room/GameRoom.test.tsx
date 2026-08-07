import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PROTOCOL_VERSION, type PlayerSnapshot } from '@texas-holdem/protocol';

import type { ConnectionAdapter } from '../connection/connection.js';
import { GameRoom, potContributionFlights } from './GameRoom.js';

const snapshot: PlayerSnapshot = {
  protocolVersion: PROTOCOL_VERSION,
  roomId: 'room-1',
  playerId: 'bob',
  sequence: 2,
  stateVersion: 2,
  room: {
    roomName: 'Friends',
    phase: 'lobby',
    initialChips: 100,
    smallBlind: 1,
    bigBlind: 2,
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
    completedHands: 0,
    players: [
      {
        playerId: 'host',
        nickname: 'Alice',
        seatIndex: 0,
        chips: 100,
        streetCommitted: 0,
        totalCommitted: 0,
        status: 'waiting',
        isHost: true,
        lobbyReady: true,
      },
      {
        playerId: 'bob',
        nickname: 'Bob',
        seatIndex: 1,
        chips: 100,
        streetCommitted: 0,
        totalCommitted: 0,
        status: 'waiting',
        isHost: false,
        lobbyReady: false,
      },
    ],
  },
  game: null,
  handReady: null,
  chipRequests: [],
  chipActivity: [],
  statistics: { players: [], titles: [] },
};

describe('GameRoom', () => {
  it('creates chip flights only for confirmed same-hand pot contributions', () => {
    const previous: PlayerSnapshot = {
      ...snapshot,
      sequence: 10,
      room: {
        ...snapshot.room,
        phase: 'playing',
        players: snapshot.room.players.map((player, index) => ({
          ...player,
          status: 'active' as const,
          streetCommitted: index === 0 ? 1 : 2,
        })),
      },
      game: {
        handId: 'hand-1',
        street: 'preflop',
        buttonPlayerId: 'host',
        smallBlindPlayerId: 'host',
        bigBlindPlayerId: 'bob',
        currentActorId: 'host',
        actionDeadlineMs: null,
        communityCards: [],
        ownHoleCards: ['As', 'Kd'],
        showdownHoleCards: {},
        totalPot: 3,
        streetPots: [{ street: 'preflop', amount: 3 }],
        legalActions: null,
      },
    };
    const next: PlayerSnapshot = {
      ...previous,
      sequence: 11,
      room: {
        ...previous.room,
        players: previous.room.players.map((player) =>
          player.playerId === 'host'
            ? { ...player, streetCommitted: 20 }
            : player,
        ),
      },
      game: {
        ...previous.game!,
        totalPot: 22,
        streetPots: [{ street: 'preflop', amount: 22 }],
      },
    };

    expect(potContributionFlights(previous, next)).toEqual([
      { id: '11-host', playerId: 'host', amount: 19 },
    ]);
    expect(
      potContributionFlights(next, {
        ...next,
        game: { ...next.game!, handId: 'hand-2', totalPot: 24 },
      }),
    ).toEqual([]);
  });

  it('renders the authoritative lobby snapshot and sends ready with its version', async () => {
    let consumeSnapshot: (value: PlayerSnapshot) => void = () => undefined;
    const sendCommand = vi.fn().mockResolvedValue({
      protocolVersion: PROTOCOL_VERSION,
      commandId: 'command-1',
      status: 'accepted',
      stateVersion: 3,
      sequence: 3,
    });
    const connection: ConnectionAdapter = {
      connect: vi.fn(async () => consumeSnapshot(snapshot)),
      disconnect: vi.fn(),
      sendCommand,
      requestResync: vi.fn(),
      onConnectionLost: vi.fn(() => () => undefined),
      onDomainEvent: vi.fn(() => () => undefined),
      onSnapshot: vi.fn((listener) => {
        consumeSnapshot = listener;
        return () => undefined;
      }),
    };
    render(
      <GameRoom
        session={{
          protocolVersion: PROTOCOL_VERSION,
          roomId: 'room-1',
          playerId: 'bob',
          token: 'bob-reconnect-token-123456',
          joinUrl: 'http://10.126.126.1:32100/?room=room-1',
          socketPath: '/socket.io',
        }}
        connectionFactory={() => connection}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: '准备' }));
    await waitFor(() =>
      expect(sendCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          roomId: 'room-1',
          playerId: 'bob',
          expectedVersion: 2,
          type: 'room.set-lobby-ready',
          ready: true,
        }),
      ),
    );
  });

  it('retries a betting action once when a conflict arrives with a newer snapshot', async () => {
    const staleSnapshot: PlayerSnapshot = {
      ...snapshot,
      playerId: 'host',
      sequence: 5,
      stateVersion: 5,
      room: {
        ...snapshot.room,
        phase: 'playing',
        players: snapshot.room.players.map((player) => ({
          ...player,
          status: 'active' as const,
        })),
      },
      game: {
        handId: 'hand-1',
        street: 'preflop',
        buttonPlayerId: 'host',
        smallBlindPlayerId: 'host',
        bigBlindPlayerId: 'bob',
        currentActorId: 'host',
        actionDeadlineMs: Date.now() + 30_000,
        communityCards: [],
        totalPot: 0,
        streetPots: [],
        ownHoleCards: ['As', 'Kd'],
        showdownHoleCards: {},
        legalActions: {
          canFold: true,
          canCheck: false,
          callAmount: 98,
          minimumRaiseTo: 100,
          maximumRaiseTo: 100,
          canAllIn: true,
        },
      },
    };
    const currentSnapshot: PlayerSnapshot = {
      ...staleSnapshot,
      sequence: 6,
      stateVersion: 6,
    };
    let consumeSnapshot: (value: PlayerSnapshot) => void = () => undefined;
    const sendCommand = vi.fn(async () => {
      if (sendCommand.mock.calls.length === 1) {
        consumeSnapshot(currentSnapshot);
        return {
          protocolVersion: PROTOCOL_VERSION,
          commandId: 'conflict-1',
          status: 'conflict' as const,
          expectedVersion: 5,
          currentVersion: 6,
          error: { code: 'CONFLICT' as const, message: 'Room state changed' },
        };
      }
      return {
        protocolVersion: PROTOCOL_VERSION,
        commandId: 'accepted-1',
        status: 'accepted' as const,
        stateVersion: 7,
        sequence: 7,
      };
    });
    const connection: ConnectionAdapter = {
      connect: vi.fn(async () => consumeSnapshot(staleSnapshot)),
      disconnect: vi.fn(),
      sendCommand,
      requestResync: vi.fn(),
      onConnectionLost: vi.fn(() => () => undefined),
      onDomainEvent: vi.fn(() => () => undefined),
      onSnapshot: vi.fn((listener) => {
        consumeSnapshot = listener;
        return () => undefined;
      }),
    };
    let commandPort:
      ((command: Record<string, unknown>) => Promise<boolean>) | null = null;
    render(
      <GameRoom
        session={{
          protocolVersion: PROTOCOL_VERSION,
          roomId: 'room-1',
          playerId: 'host',
          token: 'host-reconnect-token-123456',
          joinUrl: 'http://10.126.126.1:32100/?room=room-1',
          socketPath: '/socket.io',
        }}
        connectionFactory={() => connection}
        onCommandPortChange={(port) => {
          commandPort = port;
        }}
      />,
    );

    await screen.findByRole('heading', { name: 'Friends' });
    await expect(commandPort!({ type: 'game.call' })).resolves.toBe(true);
    expect(sendCommand).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ type: 'game.call', expectedVersion: 5 }),
    );
    expect(sendCommand).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ type: 'game.call', expectedVersion: 6 }),
    );
  });

  it('exposes the same authoritative command port to desktop close handling', async () => {
    let consumeSnapshot: (value: PlayerSnapshot) => void = () => undefined;
    const sendCommand = vi.fn().mockResolvedValue({
      protocolVersion: PROTOCOL_VERSION,
      commandId: 'close-1',
      status: 'accepted',
      stateVersion: 3,
      sequence: 3,
    });
    const connection: ConnectionAdapter = {
      connect: vi.fn(async () => consumeSnapshot(snapshot)),
      disconnect: vi.fn(),
      sendCommand,
      requestResync: vi.fn(),
      onConnectionLost: vi.fn(() => () => undefined),
      onDomainEvent: vi.fn(() => () => undefined),
      onSnapshot: vi.fn((listener) => {
        consumeSnapshot = listener;
        return () => undefined;
      }),
    };
    let commandPort:
      ((command: Record<string, unknown>) => Promise<boolean>) | null = null;
    render(
      <GameRoom
        session={{
          protocolVersion: PROTOCOL_VERSION,
          roomId: 'room-1',
          playerId: 'bob',
          token: 'bob-reconnect-token-123456',
          joinUrl: 'http://10.126.126.1:32100/?room=room-1',
          socketPath: '/socket.io',
        }}
        connectionFactory={() => connection}
        onCommandPortChange={(port) => {
          commandPort = port;
        }}
      />,
    );

    await screen.findByRole('heading', { name: 'Friends' });
    expect(commandPort).not.toBeNull();
    await commandPort!({ type: 'room.exit' });
    expect(sendCommand).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'room.exit', expectedVersion: 2 }),
    );
  });

  it('keeps voluntary exit available to ordinary players and returns only after acceptance', async () => {
    let consumeSnapshot: (value: PlayerSnapshot) => void = () => undefined;
    const onExited = vi.fn();
    const sendCommand = vi.fn().mockResolvedValue({
      protocolVersion: PROTOCOL_VERSION,
      commandId: 'exit-1',
      status: 'accepted',
      stateVersion: 3,
      sequence: 3,
    });
    const connection: ConnectionAdapter = {
      connect: vi.fn(async () => consumeSnapshot(snapshot)),
      disconnect: vi.fn(),
      sendCommand,
      requestResync: vi.fn(),
      onConnectionLost: vi.fn(() => () => undefined),
      onDomainEvent: vi.fn(() => () => undefined),
      onSnapshot: vi.fn((listener) => {
        consumeSnapshot = listener;
        return () => undefined;
      }),
    };
    render(
      <GameRoom
        session={{
          protocolVersion: PROTOCOL_VERSION,
          roomId: 'room-1',
          playerId: 'bob',
          token: 'bob-reconnect-token-123456',
          joinUrl: 'http://10.126.126.1:32100/?room=room-1',
          socketPath: '/socket.io',
        }}
        connectionFactory={() => connection}
        onExited={onExited}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: '退出房间' }));
    await waitFor(() =>
      expect(sendCommand).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'room.exit', expectedVersion: 2 }),
      ),
    );
    expect(onExited).toHaveBeenCalledOnce();
    expect(onExited).toHaveBeenCalledWith('left', {
      canChangeNickname: true,
      nickname: 'Bob',
    });
  });

  it('keeps an ordinary player in the room when voluntary exit is rejected', async () => {
    let consumeSnapshot: (value: PlayerSnapshot) => void = () => undefined;
    const onExited = vi.fn();
    const sendCommand = vi.fn().mockResolvedValue({
      protocolVersion: PROTOCOL_VERSION,
      commandId: 'exit-rejected-1',
      status: 'rejected',
      error: { code: 'NOT_ALLOWED', message: '暂时不能退出房间' },
    });
    const connection: ConnectionAdapter = {
      connect: vi.fn(async () => consumeSnapshot(snapshot)),
      disconnect: vi.fn(),
      sendCommand,
      requestResync: vi.fn(),
      onConnectionLost: vi.fn(() => () => undefined),
      onDomainEvent: vi.fn(() => () => undefined),
      onSnapshot: vi.fn((listener) => {
        consumeSnapshot = listener;
        return () => undefined;
      }),
    };
    render(
      <GameRoom
        session={{
          protocolVersion: PROTOCOL_VERSION,
          roomId: 'room-1',
          playerId: 'bob',
          token: 'bob-reconnect-token-123456',
          joinUrl: 'http://10.126.126.1:32100/?room=room-1',
          socketPath: '/socket.io',
        }}
        connectionFactory={() => connection}
        onExited={onExited}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: '退出房间' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('暂时不能退出房间'),
    );
    expect(onExited).not.toHaveBeenCalled();
  });

  it('keeps the host invitation available on demand and management actions operable', async () => {
    let consumeSnapshot: (value: PlayerSnapshot) => void = () => undefined;
    const sendCommand = vi.fn().mockResolvedValue({
      protocolVersion: PROTOCOL_VERSION,
      commandId: 'remove-1',
      status: 'accepted',
      stateVersion: 3,
      sequence: 3,
    });
    const connection: ConnectionAdapter = {
      connect: vi.fn(async () =>
        consumeSnapshot({ ...snapshot, playerId: 'host' }),
      ),
      disconnect: vi.fn(),
      sendCommand,
      requestResync: vi.fn(),
      onConnectionLost: vi.fn(() => () => undefined),
      onDomainEvent: vi.fn(() => () => undefined),
      onSnapshot: vi.fn((listener) => {
        consumeSnapshot = listener;
        return () => undefined;
      }),
    };
    render(
      <GameRoom
        session={{
          protocolVersion: PROTOCOL_VERSION,
          roomId: 'room-1',
          playerId: 'host',
          token: 'host-reconnect-token-123456',
          joinUrl: 'http://10.126.126.1:32100/?room=room-1',
          socketPath: '/socket.io',
        }}
        connectionFactory={() => connection}
      />,
    );

    await screen.findByRole('button', { name: '复制邀请链接' });
    expect(
      screen.queryByRole('button', { name: '退出房间' }),
    ).not.toBeInTheDocument();
    expect(screen.getByTitle('加入房间二维码')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '修改房间配置' }));
    fireEvent.change(screen.getByLabelText('初始筹码'), {
      target: { value: '250' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存房间配置' }));
    await waitFor(() =>
      expect(sendCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'room.update-settings',
          expectedVersion: 2,
          settings: expect.objectContaining({ initialChips: 250 }),
        }),
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: '移出' }));
    fireEvent.click(screen.getByRole('button', { name: '确认移出' }));
    await waitFor(() =>
      expect(sendCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'room.remove-player',
          targetPlayerId: 'bob',
          expectedVersion: 2,
        }),
      ),
    );
  });

  it('does not render voluntarily departed players as lobby seats or removal targets', async () => {
    let consumeSnapshot: (value: PlayerSnapshot) => void = () => undefined;
    const connection: ConnectionAdapter = {
      connect: vi.fn(async () =>
        consumeSnapshot({
          ...snapshot,
          playerId: 'host',
          room: {
            ...snapshot.room,
            players: snapshot.room.players.map((player) =>
              player.playerId === 'bob'
                ? { ...player, status: 'left' as const }
                : player,
            ),
          },
        }),
      ),
      disconnect: vi.fn(),
      sendCommand: vi.fn(),
      requestResync: vi.fn(),
      onConnectionLost: vi.fn(() => () => undefined),
      onDomainEvent: vi.fn(() => () => undefined),
      onSnapshot: vi.fn((listener) => {
        consumeSnapshot = listener;
        return () => undefined;
      }),
    };
    render(
      <GameRoom
        session={{
          protocolVersion: PROTOCOL_VERSION,
          roomId: 'room-1',
          playerId: 'host',
          token: 'host-reconnect-token-123456',
          joinUrl: 'http://10.126.126.1:32100/?room=room-1',
          socketPath: '/socket.io',
        }}
        connectionFactory={() => connection}
      />,
    );

    await screen.findByRole('heading', { name: 'Friends' });
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '移出' }),
    ).not.toBeInTheDocument();
  });

  it('immediately reports when the authoritative snapshot removes this player', async () => {
    let consumeSnapshot: (value: PlayerSnapshot) => void = () => undefined;
    let commandPort:
      ((command: Record<string, unknown>) => Promise<boolean>) | null = null;
    const onExited = vi.fn();
    const connection: ConnectionAdapter = {
      connect: vi.fn(async () => consumeSnapshot(snapshot)),
      disconnect: vi.fn(),
      sendCommand: vi.fn(),
      requestResync: vi.fn(),
      onConnectionLost: vi.fn(() => () => undefined),
      onDomainEvent: vi.fn(() => () => undefined),
      onSnapshot: vi.fn((listener) => {
        consumeSnapshot = listener;
        return () => undefined;
      }),
    };
    render(
      <GameRoom
        session={{
          protocolVersion: PROTOCOL_VERSION,
          roomId: 'room-1',
          playerId: 'bob',
          token: 'bob-reconnect-token-123456',
          joinUrl: 'http://10.126.126.1:32100/?room=room-1',
          socketPath: '/socket.io',
        }}
        connectionFactory={() => connection}
        onExited={onExited}
        onCommandPortChange={(port) => {
          commandPort = port;
        }}
      />,
    );
    await screen.findByRole('heading', { name: 'Friends' });

    act(() =>
      consumeSnapshot({
        ...snapshot,
        sequence: 3,
        stateVersion: 3,
        room: {
          ...snapshot.room,
          phase: 'hand-ready',
          players: snapshot.room.players.map((player) =>
            player.playerId === 'bob'
              ? { ...player, status: 'removed' as const }
              : player,
          ),
        },
      }),
    );

    expect(onExited).toHaveBeenCalledOnce();
    expect(onExited).toHaveBeenCalledWith('removed');
    await expect(
      commandPort!({ type: 'hand-ready.set-choice', choice: 'ready' }),
    ).resolves.toBe(false);
    expect(connection.sendCommand).not.toHaveBeenCalled();
  });

  it('does not render a removed player on the table or offer removal again', async () => {
    let consumeSnapshot: (value: PlayerSnapshot) => void = () => undefined;
    const connection: ConnectionAdapter = {
      connect: vi.fn(async () =>
        consumeSnapshot({
          ...snapshot,
          playerId: 'host',
          room: {
            ...snapshot.room,
            phase: 'hand-ready',
            players: snapshot.room.players.map((player) =>
              player.playerId === 'bob'
                ? { ...player, status: 'removed' as const }
                : player,
            ),
          },
        }),
      ),
      disconnect: vi.fn(),
      sendCommand: vi.fn(),
      requestResync: vi.fn(),
      onConnectionLost: vi.fn(() => () => undefined),
      onDomainEvent: vi.fn(() => () => undefined),
      onSnapshot: vi.fn((listener) => {
        consumeSnapshot = listener;
        return () => undefined;
      }),
    };
    render(
      <GameRoom
        session={{
          protocolVersion: PROTOCOL_VERSION,
          roomId: 'room-1',
          playerId: 'host',
          token: 'host-reconnect-token-123456',
          joinUrl: 'http://10.126.126.1:32100/?room=room-1',
          socketPath: '/socket.io',
        }}
        connectionFactory={() => connection}
      />,
    );

    expect(await screen.findAllByText('Alice')).not.toHaveLength(0);
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '房主管理' }));
    expect(screen.queryByRole('button', { name: '踢出 Bob' })).toBeNull();
  });

  it('keeps chip requests and statistics operable in the mobile hand-ready flow', async () => {
    const handReadySnapshot: PlayerSnapshot = {
      ...snapshot,
      sequence: 5,
      stateVersion: 5,
      room: {
        ...snapshot.room,
        phase: 'hand-ready',
        players: snapshot.room.players.map((player) => ({
          ...player,
          status: 'active' as const,
        })),
      },
      handReady: {
        deadlineMs: Date.now() + 30_000,
        ownChoice: 'pending',
        pendingRequests: [],
      },
      game: {
        handId: 'hand-1',
        street: 'settled',
        buttonPlayerId: 'host',
        smallBlindPlayerId: 'host',
        bigBlindPlayerId: 'bob',
        currentActorId: null,
        actionDeadlineMs: null,
        communityCards: ['As', 'Ad', 'Kc', 'Qd', 'Jh'],
        totalPot: 0,
        streetPots: [],
        ownHoleCards: ['2c', '3d'],
        showdownHoleCards: { host: ['Ac', 'Ks'] },
        legalActions: null,
        settlement: {
          reason: 'showdown',
          winnerIds: ['host'],
          payouts: { host: 20 },
          netChanges: { host: 20, bob: -20 },
          showdownResults: [
            {
              playerId: 'host',
              handType: 'one-pair',
              bestFiveCards: ['As', 'Ad', 'Ac', 'Ks', 'Qd'],
            },
          ],
          voluntaryRevealedHoleCards: {},
        },
      },
      statistics: {
        players: [
          {
            playerId: 'host',
            currentChips: 99,
            netWinLoss: -1,
            participatedHands: 1,
            wonHands: 0,
            largestSingleHandProfit: 0,
            largestSingleHandLoss: 0,
            showdownCount: 0,
            showdownWinRate: null,
            actions: { fold: 1, check: 0, call: 0, raiseTo: 0, allIn: 0 },
          },
          {
            playerId: 'bob',
            currentChips: 101,
            netWinLoss: 1,
            participatedHands: 1,
            wonHands: 1,
            largestSingleHandProfit: 1,
            largestSingleHandLoss: 3,
            showdownCount: 0,
            showdownWinRate: null,
            actions: { fold: 0, check: 0, call: 0, raiseTo: 0, allIn: 0 },
          },
        ],
        titles: [],
      },
    };
    let consumeSnapshot: (value: PlayerSnapshot) => void = () => undefined;
    const sendCommand = vi.fn().mockResolvedValue({
      protocolVersion: PROTOCOL_VERSION,
      commandId: 'command-2',
      status: 'accepted',
      stateVersion: 6,
      sequence: 6,
    });
    const connection: ConnectionAdapter = {
      connect: vi.fn(async () => consumeSnapshot(handReadySnapshot)),
      disconnect: vi.fn(),
      sendCommand,
      requestResync: vi.fn(),
      onConnectionLost: vi.fn(() => () => undefined),
      onDomainEvent: vi.fn(() => () => undefined),
      onSnapshot: vi.fn((listener) => {
        consumeSnapshot = listener;
        return () => undefined;
      }),
    };
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 360,
    });
    render(
      <GameRoom
        session={{
          protocolVersion: PROTOCOL_VERSION,
          roomId: 'room-1',
          playerId: 'bob',
          token: 'bob-reconnect-token-123456',
          joinUrl: 'http://10.126.126.1:32100/?room=room-1',
          socketPath: '/socket.io',
        }}
        connectionFactory={() => connection}
      />,
    );

    const settlementPlayers = await screen.findByLabelText('本手结算玩家牌型');
    expect(screen.queryByLabelText('公共牌牌面')).toBeNull();
    expect(screen.queryByLabelText('本手底池')).toBeNull();
    expect(screen.queryByLabelText('我的底牌')).toBeNull();
    expect(screen.queryByLabelText('摊牌玩家手牌')).toBeNull();
    expect(screen.getByLabelText('本手牌面与底池')).toBeInTheDocument();
    expect(
      within(settlementPlayers).getByLabelText('Alice 的底牌'),
    ).toBeInTheDocument();
    expect(
      within(settlementPlayers).getAllByLabelText(/Alice 的最佳第 .* 张牌/),
    ).toHaveLength(5);
    expect(
      within(settlementPlayers).getAllByLabelText(/Bob 的第 .* 张底牌，未公开/),
    ).toHaveLength(2);
    expect(
      within(settlementPlayers).getByText('Alice').parentElement,
    ).toHaveTextContent('Alice· 100 筹码赢得 20 筹码');
    expect(
      within(settlementPlayers).getByText('Bob').parentElement,
    ).toHaveTextContent('Bob· 100 筹码输掉 20 筹码');
    const showdownButton = await screen.findByRole('button', { name: '摊牌' });
    expect(showdownButton.closest('.hand-ready-card__actions')).not.toBeNull();
    expect(showdownButton.closest('.table-seat')).toBeNull();
    fireEvent.click(showdownButton);
    await waitFor(() =>
      expect(sendCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedVersion: 5,
          type: 'game.show-hole-cards',
        }),
      ),
    );
    fireEvent.click(await screen.findByRole('button', { name: '筹码交换' }));
    fireEvent.click(await screen.findByRole('button', { name: '发起请求' }));
    fireEvent.click(screen.getByRole('button', { name: /^确认$/ }));
    await waitFor(() =>
      expect(sendCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedVersion: 5,
          type: 'chips.request',
          targetPlayerId: 'host',
          amount: 100,
        }),
      ),
    );

    const statisticsButton = screen.getByRole('button', { name: '查看统计' });
    expect(statisticsButton).toHaveClass('button', 'button--secondary');
    fireEvent.click(statisticsButton);
    expect(
      screen.getByRole('heading', { name: '牌局战报' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: '筹码交换' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('#1 Bob')).toBeInTheDocument();
    expect(
      screen.getByText('+1', { selector: '.statistics-positive' }),
    ).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1 / 0 / 0 / 0 / 0')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(
      screen.queryByRole('heading', { name: '牌局战报' }),
    ).not.toBeInTheDocument();
    expect(statisticsButton).toHaveFocus();
    expect(window.innerWidth).toBe(360);

    act(() =>
      consumeSnapshot({
        ...handReadySnapshot,
        sequence: 6,
        stateVersion: 6,
        room: {
          ...handReadySnapshot.room,
          players: handReadySnapshot.room.players.map((player) =>
            player.playerId === 'bob' ? { ...player, chips: 1_250 } : player,
          ),
        },
        game: {
          ...handReadySnapshot.game!,
          settlement: {
            ...handReadySnapshot.game!.settlement!,
            voluntaryRevealedHoleCards: { bob: ['2c', '3d'] },
            revealedHandResults: [
              {
                playerId: 'bob',
                handType: 'one-pair',
                bestFiveCards: ['As', 'Ad', 'Kc', 'Qd', 'Jh'],
              },
            ],
          },
        },
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '摊牌' })).toBeNull(),
    );
    expect(
      within(screen.getByLabelText('本手结算玩家牌型')).getByText('Bob')
        .parentElement,
    ).toHaveTextContent('Bob· 1,250 筹码输掉 20 筹码');
    expect(
      within(screen.getByLabelText('本手结算玩家牌型')).getByLabelText(
        'Bob 的一对',
      ),
    ).toBeInTheDocument();
  });

  it('does not render removed players on the poker table', async () => {
    const playingSnapshot: PlayerSnapshot = {
      ...snapshot,
      playerId: 'host',
      room: {
        ...snapshot.room,
        phase: 'playing',
        players: snapshot.room.players.map((player) =>
          player.playerId === 'bob'
            ? { ...player, status: 'removed' as const }
            : { ...player, status: 'active' as const },
        ),
      },
      game: {
        handId: 'hand-1',
        street: 'preflop',
        buttonPlayerId: 'host',
        smallBlindPlayerId: 'host',
        bigBlindPlayerId: 'bob',
        currentActorId: 'host',
        actionDeadlineMs: Date.now() + 30_000,
        communityCards: [],
        totalPot: 0,
        streetPots: [],
        ownHoleCards: ['As', 'Kd'],
        showdownHoleCards: {},
        legalActions: null,
      },
    };
    const connection: ConnectionAdapter = {
      connect: vi.fn(async () => undefined),
      disconnect: vi.fn(),
      sendCommand: vi.fn(),
      requestResync: vi.fn(),
      onConnectionLost: vi.fn(() => () => undefined),
      onDomainEvent: vi.fn(() => () => undefined),
      onSnapshot: vi.fn((listener) => {
        listener(playingSnapshot);
        return () => undefined;
      }),
    };

    render(
      <GameRoom
        session={{
          protocolVersion: PROTOCOL_VERSION,
          roomId: 'room-1',
          playerId: 'host',
          token: 'host-reconnect-token-123456',
          joinUrl: 'http://10.126.126.1:32100/?room=room-1',
          socketPath: '/socket.io',
        }}
        connectionFactory={() => connection}
      />,
    );

    expect(await screen.findAllByText('Alice')).not.toHaveLength(0);
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
  });

  it('shows the server action countdown on the table felt', async () => {
    const playingSnapshot: PlayerSnapshot = {
      ...snapshot,
      room: {
        ...snapshot.room,
        phase: 'playing',
        players: snapshot.room.players.map((player) => ({
          ...player,
          status: 'active' as const,
        })),
      },
      game: {
        handId: 'hand-1',
        street: 'preflop',
        buttonPlayerId: 'host',
        smallBlindPlayerId: 'host',
        bigBlindPlayerId: 'bob',
        currentActorId: 'host',
        actionDeadlineMs: Date.now() + 30_000,
        communityCards: [],
        totalPot: 0,
        streetPots: [],
        ownHoleCards: null,
        showdownHoleCards: {},
        legalActions: null,
      },
    };
    let consumeSnapshot: (value: PlayerSnapshot) => void = () => undefined;
    const onExited = vi.fn();
    const connection: ConnectionAdapter = {
      connect: vi.fn(async () => consumeSnapshot(playingSnapshot)),
      disconnect: vi.fn(),
      sendCommand: vi.fn().mockResolvedValue({
        protocolVersion: PROTOCOL_VERSION,
        commandId: 'table-exit',
        status: 'accepted',
        stateVersion: 3,
        sequence: 3,
      }),
      requestResync: vi.fn(),
      onConnectionLost: vi.fn(() => () => undefined),
      onDomainEvent: vi.fn(() => () => undefined),
      onSnapshot: vi.fn((listener) => {
        consumeSnapshot = listener;
        return () => undefined;
      }),
    };

    render(
      <GameRoom
        session={{
          protocolVersion: PROTOCOL_VERSION,
          roomId: 'room-1',
          playerId: 'bob',
          token: 'bob-reconnect-token-123456',
          joinUrl: 'http://10.126.126.1:32100/?room=room-1',
          socketPath: '/socket.io',
        }}
        connectionFactory={() => connection}
        onExited={onExited}
      />,
    );

    expect(
      await screen.findByLabelText(/Alice 行动剩余 \d+ 秒/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('牌局进度')).toHaveTextContent(
      '第 1 局 · 翻牌前 · 盲注：1/2 · 当前行动：Alice',
    );
    expect(screen.getByText('行动中')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '退出房间' }));
    fireEvent.click(screen.getByRole('button', { name: '退出房间' }));
    fireEvent.click(screen.getByRole('button', { name: '确认退出' }));
    await waitFor(() =>
      expect(onExited).toHaveBeenCalledWith('left', {
        canChangeNickname: false,
      }),
    );
  });

  it('shows a terminal closed-room state and returns without another command', async () => {
    let consumeSnapshot: (value: PlayerSnapshot) => void = () => undefined;
    let reportConnectionLost: (reason: string) => void = () => undefined;
    const onExited = vi.fn();
    const onHostRoomClosed = vi.fn(async () => undefined);
    const sendCommand = vi.fn();
    const connection: ConnectionAdapter = {
      connect: vi.fn(async () =>
        consumeSnapshot({
          ...snapshot,
          room: { ...snapshot.room, phase: 'closed' },
        }),
      ),
      disconnect: vi.fn(),
      sendCommand,
      requestResync: vi.fn(),
      onConnectionLost: vi.fn((listener) => {
        reportConnectionLost = listener;
        return () => undefined;
      }),
      onDomainEvent: vi.fn(() => () => undefined),
      onSnapshot: vi.fn((listener) => {
        consumeSnapshot = listener;
        return () => undefined;
      }),
    };
    render(
      <GameRoom
        session={{
          protocolVersion: PROTOCOL_VERSION,
          roomId: 'room-1',
          playerId: 'bob',
          token: 'bob-reconnect-token-123456',
          joinUrl: 'http://10.126.126.1:32100/?room=room-1',
          socketPath: '/socket.io',
        }}
        connectionFactory={() => connection}
        onExited={onExited}
        onHostRoomClosed={onHostRoomClosed}
      />,
    );

    expect(
      await screen.findByRole('heading', { name: '房间已关闭' }),
    ).toBeInTheDocument();
    act(() => reportConnectionLost('transport close'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '返回联机首页' }));
    expect(onExited).toHaveBeenCalledOnce();
    expect(sendCommand).not.toHaveBeenCalled();
    expect(onHostRoomClosed).not.toHaveBeenCalled();
  });

  it('stops the host service once after the host receives a closed snapshot', async () => {
    let consumeSnapshot: (value: PlayerSnapshot) => void = () => undefined;
    const onHostRoomClosed = vi.fn(async () => undefined);
    const closedSnapshot: PlayerSnapshot = {
      ...snapshot,
      playerId: 'host',
      room: { ...snapshot.room, phase: 'closed' },
    };
    const connection: ConnectionAdapter = {
      connect: vi.fn(async () => consumeSnapshot(closedSnapshot)),
      disconnect: vi.fn(),
      sendCommand: vi.fn(),
      requestResync: vi.fn(),
      onConnectionLost: vi.fn(() => () => undefined),
      onDomainEvent: vi.fn(() => () => undefined),
      onSnapshot: vi.fn((listener) => {
        consumeSnapshot = listener;
        return () => undefined;
      }),
    };
    render(
      <GameRoom
        session={{
          protocolVersion: PROTOCOL_VERSION,
          roomId: 'room-1',
          playerId: 'host',
          token: 'host-reconnect-token-123456',
          joinUrl: 'http://10.126.126.1:32100/?room=room-1',
          socketPath: '/socket.io',
        }}
        connectionFactory={() => connection}
        onHostRoomClosed={onHostRoomClosed}
      />,
    );

    await waitFor(() => expect(onHostRoomClosed).toHaveBeenCalledOnce());
    consumeSnapshot({
      ...closedSnapshot,
      sequence: closedSnapshot.sequence + 1,
    });
    await waitFor(() => expect(onHostRoomClosed).toHaveBeenCalledOnce());
  });
});
