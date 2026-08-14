import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  PROTOCOL_VERSION,
  type HostManagementSnapshot,
} from '@texas-holdem/protocol';

import type { ConnectionAdapter } from '../connection/connection.js';
import { HostConsole } from './HostConsole.js';
import { HostSpectatorRoom } from './HostSpectatorRoom.js';

const settings = {
  roomName: 'Service table',
  maxPlayers: 4,
  initialChips: 100,
  smallBlind: 1,
  actionTimeoutSeconds: 30,
  handReadyTimeoutSeconds: 30,
  blindGrowth: { enabled: false, intervalHands: 10, multiplier: 2 },
  zeroChipPolicy: 'request-chips' as const,
};

const snapshot: HostManagementSnapshot = {
  protocolVersion: PROTOCOL_VERSION,
  roomId: 'room-1',
  hostId: 'host-1',
  hostParticipation: 'service-only',
  sequence: 1,
  stateVersion: 1,
  room: {
    roomName: 'Service table',
    phase: 'lobby',
    settings,
    currentSmallBlind: 1,
    currentBigBlind: 2,
    completedHands: 0,
    players: [
      {
        playerId: 'player-1',
        nickname: 'Alice',
        seatIndex: 0,
        chips: 100,
        streetCommitted: 0,
        totalCommitted: 0,
        status: 'waiting',
        isHost: false,
        lobbyReady: true,
      },
      {
        playerId: 'player-2',
        nickname: 'Bob',
        seatIndex: 1,
        chips: 100,
        streetCommitted: 0,
        totalCommitted: 0,
        status: 'waiting',
        isHost: false,
        lobbyReady: true,
      },
    ],
  },
  game: null,
  handReady: null,
};

function connection(): ConnectionAdapter {
  return {
    connect: vi.fn(async () => undefined),
    disconnect: vi.fn(),
    sendCommand: vi.fn(async () => ({
      protocolVersion: PROTOCOL_VERSION,
      commandId: 'command-1',
      status: 'accepted' as const,
      stateVersion: 2,
      sequence: 2,
    })),
    requestResync: vi.fn(async () => ({
      protocolVersion: PROTOCOL_VERSION,
      status: 'events' as const,
      latestSequence: 1,
      events: [],
    })),
    requestHostResync: vi.fn(async () => ({
      protocolVersion: PROTOCOL_VERSION,
      status: 'snapshot' as const,
      latestSequence: 1,
      snapshot,
    })),
    onConnectionLost: vi.fn(() => () => undefined),
    onDomainEvent: vi.fn(() => () => undefined),
    onSnapshot: vi.fn(() => () => undefined),
    onHostSnapshot: vi.fn(() => () => undefined),
  };
}

describe('HostConsole', () => {
  it('renders actual players and public controls without a Host player card', async () => {
    const adapter = connection();
    render(
      <HostConsole
        session={{
          protocolVersion: PROTOCOL_VERSION,
          roomId: 'room-1',
          playerId: 'host-1',
          hostId: 'host-1',
          sessionType: 'host',
          token: 'host-token-123456',
          joinUrl: 'http://127.0.0.1:32100/?room=room-1',
          socketPath: '/socket.io',
        }}
        connectionFactory={() => adapter}
      />,
    );
    expect(
      await screen.findByRole('heading', { name: 'Service table' }),
    ).toBeInTheDocument();
    expect(document.querySelector('.game-room-shell')).toBeInTheDocument();
    expect(screen.getByText('2/2 已准备')).toBeInTheDocument();
    expect(screen.getByText(/Alice/)).toBeInTheDocument();
    expect(screen.getByText(/Bob/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '开始游戏' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '加入观战' })).toBeDisabled();
    await waitFor(() => expect(adapter.connect).toHaveBeenCalled());
  });

  it('opens a read-only spectator table from the Host console', async () => {
    const onBack = vi.fn();
    render(
      <HostSpectatorRoom
        snapshot={{
          ...snapshot,
          room: { ...snapshot.room, phase: 'playing' },
          game: {
            handId: 'hand-1',
            handNumber: 1,
            street: 'flop',
            buttonPlayerId: 'player-1',
            smallBlindPlayerId: 'player-1',
            bigBlindPlayerId: 'player-2',
            currentActorId: 'player-2',
            actionDeadlineMs: 60_000,
            communityCards: ['2c', '7d', 'Jh'],
            totalPot: 20,
            streetPots: [{ street: 'preflop', amount: 20 }],
          },
        }}
        onBack={onBack}
      />,
    );

    expect(screen.getByText('只读观战 · 仅显示公开信息')).toBeInTheDocument();
    expect(screen.getByRole('main').parentElement).toHaveClass(
      'game-room-shell',
    );
    expect(screen.getByLabelText('公共牌')).toBeInTheDocument();
    expect(screen.getByText(/轮到 Bob/)).toBeInTheDocument();
    expect(screen.getByLabelText('牌局进度')).toHaveTextContent('盲注：1/2');
    expect(
      screen.queryByRole('button', { name: '下注' }),
    ).not.toBeInTheDocument();
    screen.getByRole('button', { name: '返回房主控制台' }).click();
    expect(onBack).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.getByText('只读观战 · 仅显示公开信息')).toBeInTheDocument(),
    );
  });

  it('shows collapsible public settlement cards without ready controls or table duplicates', () => {
    const { container } = render(
      <HostSpectatorRoom
        snapshot={{
          ...snapshot,
          room: {
            ...snapshot.room,
            phase: 'hand-ready',
            currentSmallBlind: 5,
            currentBigBlind: 10,
          },
          game: {
            handId: 'hand-1',
            handNumber: 1,
            street: 'settled',
            buttonPlayerId: 'player-1',
            smallBlindPlayerId: 'player-1',
            bigBlindPlayerId: 'player-2',
            currentActorId: null,
            actionDeadlineMs: null,
            communityCards: ['2c', '7d', 'Jh'],
            totalPot: 20,
            streetPots: [{ street: 'preflop', amount: 20 }],
            showdownHoleCards: { 'player-1': ['As', 'Kd'] },
            settlement: {
              reason: 'showdown',
              winnerIds: ['player-1'],
              payouts: { 'player-1': 20 },
              netChanges: { 'player-1': 10, 'player-2': -10 },
              showdownResults: [
                {
                  playerId: 'player-1',
                  handType: 'one-pair',
                  bestFiveCards: ['As', 'Kd', 'Jh', '7d', '2c'],
                },
              ],
              voluntaryRevealedHoleCards: {},
            },
          },
          handReady: {
            deadlineMs: 60_000,
            players: [
              { playerId: 'player-1', choice: 'pending' },
              { playerId: 'player-2', choice: 'pending' },
            ],
          },
        }}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('观战结算')).toBeInTheDocument();
    expect(screen.getByLabelText('Alice 的底牌')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '就绪' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '暂不参与' }),
    ).not.toBeInTheDocument();
    expect(container.querySelector('.hole-cards')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '收起结算详情' }));
    expect(
      screen.getByRole('button', { name: '公开结算详情' }),
    ).toBeInTheDocument();
  });
});
