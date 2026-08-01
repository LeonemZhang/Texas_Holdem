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
    expect(onStartFirstHand).not.toHaveBeenCalled();
  });

  it('enables start only for the host after every connected player is ready', () => {
    const onStartFirstHand = vi.fn();
    const { rerender } = render(
      <LobbyWaitingRoom
        roomName="朋友局"
        currentPlayerId="host"
        players={players(false)}
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
