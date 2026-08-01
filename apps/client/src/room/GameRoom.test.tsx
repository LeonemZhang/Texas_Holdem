import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PROTOCOL_VERSION, type PlayerSnapshot } from '@texas-holdem/protocol';

import type { ConnectionAdapter } from '../connection/connection.js';
import { GameRoom } from './GameRoom.js';

const snapshot: PlayerSnapshot = {
  protocolVersion: PROTOCOL_VERSION,
  roomId: 'room-1',
  playerId: 'bob',
  sequence: 2,
  stateVersion: 2,
  room: {
    roomName: 'Friends',
    phase: 'lobby',
    smallBlind: 1,
    bigBlind: 2,
    completedHands: 0,
    players: [
      {
        playerId: 'host',
        nickname: 'Alice',
        seatIndex: 0,
        chips: 100,
        status: 'waiting',
        isHost: true,
        lobbyReady: true,
      },
      {
        playerId: 'bob',
        nickname: 'Bob',
        seatIndex: 1,
        chips: 100,
        status: 'waiting',
        isHost: false,
        lobbyReady: false,
      },
    ],
  },
  game: null,
  handReady: null,
  statistics: { players: [], titles: [] },
};

describe('GameRoom', () => {
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
      statistics: {
        players: [
          {
            playerId: 'host',
            currentChips: 99,
            participatedHands: 1,
            wonHands: 0,
            showdownWinRate: null,
          },
          {
            playerId: 'bob',
            currentChips: 101,
            participatedHands: 1,
            wonHands: 1,
            showdownWinRate: null,
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

    fireEvent.click(await screen.findByRole('button', { name: '发起请求' }));
    fireEvent.click(screen.getByRole('button', { name: /^确认$/ }));
    await waitFor(() =>
      expect(sendCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedVersion: 5,
          type: 'chips.request',
          audience: 'table',
          amount: 100,
        }),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: '查看统计' }));
    expect(
      screen.getByRole('heading', { name: '牌局战报' }),
    ).toBeInTheDocument();
    expect(screen.getByText('#1 Bob')).toBeInTheDocument();
    expect(window.innerWidth).toBe(360);
  });
});
