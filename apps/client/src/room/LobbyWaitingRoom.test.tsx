import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { LobbyWaitingRoom, type LobbyPlayerView } from './LobbyWaitingRoom.js';

const players = (allReady = false): LobbyPlayerView[] => [
  {
    playerId: 'host',
    nickname: 'Alice',
    seatIndex: 0,
    isHost: true,
    ready: allReady,
    connected: true,
  },
  {
    playerId: 'bob',
    nickname: 'Bob',
    seatIndex: 1,
    isHost: false,
    ready: allReady,
    connected: true,
  },
];

describe('LobbyWaitingRoom', () => {
  it('shows the host as a seated player and never starts automatically', () => {
    const onStartFirstHand = vi.fn();
    render(
      <LobbyWaitingRoom
        roomName="朋友局"
        currentPlayerId="host"
        players={players(true)}
        onSetReady={vi.fn()}
        onStartFirstHand={onStartFirstHand}
      />,
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('房主 · 玩家')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '开始游戏' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: '取消准备' })).toBeNull();
    expect(onStartFirstHand).not.toHaveBeenCalled();
  });

  it('enables start once every non-host connected player is ready', () => {
    const onStartFirstHand = vi.fn();
    const { rerender } = render(
      <LobbyWaitingRoom
        roomName="朋友局"
        currentPlayerId="host"
        players={[{ ...players(false)[0]!, ready: true }, players(false)[1]!]}
        onSetReady={vi.fn()}
        onStartFirstHand={onStartFirstHand}
      />,
    );
    expect(screen.getByRole('button', { name: '开始游戏' })).toBeDisabled();

    rerender(
      <LobbyWaitingRoom
        roomName="朋友局"
        currentPlayerId="host"
        players={players(true)}
        onSetReady={vi.fn()}
        onStartFirstHand={onStartFirstHand}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '开始游戏' }));
    expect(onStartFirstHand).toHaveBeenCalledOnce();
  });

  it('does not start while any seated player is still unready', () => {
    const onStartFirstHand = vi.fn();
    const mixedReadiness = players(true);
    mixedReadiness[1] = { ...mixedReadiness[1]!, ready: false };

    render(
      <LobbyWaitingRoom
        roomName="朋友局"
        currentPlayerId="host"
        players={mixedReadiness}
        onSetReady={vi.fn()}
        onStartFirstHand={onStartFirstHand}
      />,
    );

    const startButton = screen.getByRole('button', { name: '开始游戏' });
    expect(startButton).toBeDisabled();
    expect(screen.getByText('还有 1 位玩家未准备')).toBeInTheDocument();
    fireEvent.click(startButton);
    expect(onStartFirstHand).not.toHaveBeenCalled();
  });

  it('lets a non-host prepare but does not expose the start action', () => {
    const onSetReady = vi.fn();
    render(
      <LobbyWaitingRoom
        roomName="朋友局"
        currentPlayerId="bob"
        players={players(false)}
        onSetReady={onSetReady}
        onStartFirstHand={vi.fn()}
      />,
    );
    expect(
      screen.queryByRole('button', { name: '开始游戏' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '准备' }));
    expect(onSetReady).toHaveBeenCalledWith(true);
  });
});
