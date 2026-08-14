import { fireEvent, render, screen, within } from '@testing-library/react';
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
  it('lets the host open and submit the lobby room settings editor', () => {
    const onUpdateSettings = vi.fn();
    render(
      <LobbyWaitingRoom
        roomName="朋友局"
        currentPlayerId="host"
        players={players(true)}
        currentSmallBlind={10}
        settings={{
          roomName: '朋友局',
          maxPlayers: 10,
          initialChips: 100,
          smallBlind: 1,
          actionTimeoutSeconds: 30,
          handReadyTimeoutSeconds: 30,
          blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
          zeroChipPolicy: 'request-chips',
        }}
        onSetReady={vi.fn()}
        onStartFirstHand={vi.fn()}
        onUpdateSettings={onUpdateSettings}
      />,
    );

    const seatActions = screen
      .getByRole('button', { name: '修改房间配置' })
      .closest('.lobby__seat-action') as HTMLElement;
    expect(
      within(seatActions!)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['修改房间配置', '随机打乱']);
    fireEvent.click(screen.getByRole('button', { name: '修改房间配置' }));
    const settingsDialog = screen.getByRole('dialog', {
      name: '修改房间配置',
    });
    expect(settingsDialog).toHaveClass('modal-dialog--room-settings');
    expect(settingsDialog).toContainElement(screen.getByLabelText('初始筹码'));
    expect(screen.queryByLabelText('当前小盲')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('初始筹码'), {
      target: { value: '250' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存房间配置' }));

    expect(onUpdateSettings).toHaveBeenCalledWith(
      expect.objectContaining({ initialChips: 250 }),
    );
    expect(
      screen.queryByRole('dialog', { name: '修改房间配置' }),
    ).not.toBeInTheDocument();
  });

  it('shows only the configured number of seats in a row-first two-column layout', () => {
    const fivePlayers = [
      ...players(true),
      {
        playerId: 'carol',
        nickname: 'Carol',
        seatIndex: 2,
        isHost: false,
        ready: true,
        connected: true,
      },
      {
        playerId: 'dave',
        nickname: 'Dave',
        seatIndex: 3,
        isHost: false,
        ready: true,
        connected: true,
      },
      {
        playerId: 'erin',
        nickname: 'Erin',
        seatIndex: 4,
        isHost: false,
        ready: true,
        connected: true,
      },
    ];
    render(
      <LobbyWaitingRoom
        roomName="朋友局"
        currentPlayerId="host"
        players={fivePlayers}
        settings={{
          roomName: '朋友局',
          maxPlayers: 5,
          initialChips: 100,
          smallBlind: 1,
          actionTimeoutSeconds: 30,
          handReadyTimeoutSeconds: 30,
          blindGrowth: { enabled: true, intervalHands: 10, multiplier: 2 },
          zeroChipPolicy: 'request-chips',
        }}
        onSetReady={vi.fn()}
        onStartFirstHand={vi.fn()}
      />,
    );

    const seatMap = screen.getByRole('list', { name: '房间座位' });
    expect(within(seatMap).getAllByRole('listitem')).toHaveLength(5);
    expect(seatMap.getAttribute('style')).toContain('--lobby-seat-rows: 3');
    expect(within(seatMap).getByText('Erin')).toBeInTheDocument();
  });

  it('lets the host copy the invitation QR code', () => {
    render(
      <LobbyWaitingRoom
        roomName="朋友局"
        currentPlayerId="host"
        players={players(true)}
        joinUrl="http://10.126.126.1:32100/?room=room-1"
        onSetReady={vi.fn()}
        onStartFirstHand={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: '复制二维码' }),
    ).toBeInTheDocument();
  });

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

  it('keeps joining spectator mode disabled before the first hand starts', () => {
    const onEnterSpectator = vi.fn();
    const { rerender } = render(
      <LobbyWaitingRoom
        roomName="朋友局"
        currentPlayerId="host"
        players={players(true)}
        phase="lobby"
        onStartFirstHand={vi.fn()}
        onEnterSpectator={onEnterSpectator}
      />,
    );

    const spectatorButton = screen.getByRole('button', { name: '加入观战' });
    expect(spectatorButton).toBeDisabled();
    fireEvent.click(spectatorButton);
    expect(onEnterSpectator).not.toHaveBeenCalled();

    rerender(
      <LobbyWaitingRoom
        roomName="朋友局"
        currentPlayerId="host"
        players={players(true)}
        phase="playing"
        onStartFirstHand={vi.fn()}
        onEnterSpectator={onEnterSpectator}
      />,
    );
    expect(screen.getByRole('button', { name: '加入观战' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '加入观战' }));
    expect(onEnterSpectator).toHaveBeenCalledOnce();
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

  it('keeps a ten-seat map by default and preserves physical seat numbers', () => {
    const nonCompactPlayers = players(true);
    nonCompactPlayers[1] = { ...nonCompactPlayers[1]!, seatIndex: 6 };
    render(
      <LobbyWaitingRoom
        roomName="朋友局"
        currentPlayerId="host"
        players={nonCompactPlayers}
        onSetReady={vi.fn()}
        onStartFirstHand={vi.fn()}
      />,
    );

    const seatMap = screen.getByRole('list', { name: '房间座位' });
    const seats = within(seatMap).getAllByRole('listitem');
    expect(seats).toHaveLength(10);
    expect(seats[0]).toHaveTextContent('座位 1Alice');
    expect(seats[1]).toHaveTextContent('座位 2空座位');
    expect(seats[6]).toHaveTextContent('座位 7Bob');
  });

  it('sends one authoritative seat exchange after a host drag completes', () => {
    const onReseatPlayer = vi.fn();
    render(
      <LobbyWaitingRoom
        roomName="朋友局"
        currentPlayerId="host"
        players={players(true)}
        onSetReady={vi.fn()}
        onStartFirstHand={vi.fn()}
        onReseatPlayer={onReseatPlayer}
        onShuffleSeats={vi.fn()}
      />,
    );

    const source = screen.getByText('Alice').closest('li')!;
    const target = screen.getByText('Bob').closest('li')!;
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn(),
      getData: vi.fn(() => 'host'),
    };

    expect(source).toHaveAttribute('draggable', 'true');
    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    expect(onReseatPlayer).toHaveBeenCalledWith('host', 1);
    expect(onReseatPlayer).toHaveBeenCalledOnce();
    expect(
      screen.queryByRole('button', { name: '调整座位' }),
    ).not.toBeInTheDocument();
  });

  it('does not offer empty physical seats as host drag targets', () => {
    const onReseatPlayer = vi.fn();
    render(
      <LobbyWaitingRoom
        roomName="朋友局"
        currentPlayerId="host"
        players={players(true)}
        onSetReady={vi.fn()}
        onStartFirstHand={vi.fn()}
        onReseatPlayer={onReseatPlayer}
      />,
    );
    const source = screen.getByText('Bob').closest('li')!;
    const target = screen.getByText('座位 4').closest('li')!;
    const dataTransfer = {
      effectAllowed: '',
      dropEffect: '',
      setData: vi.fn(),
      getData: vi.fn(() => 'bob'),
    };

    fireEvent.dragStart(source, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });

    expect(target).not.toHaveClass('lobby-player--drop-target');
    expect(onReseatPlayer).not.toHaveBeenCalled();
  });

  it('asks the host to shuffle before dragging a non-compact seat map', () => {
    const nonCompactPlayers = players(true);
    nonCompactPlayers[1] = { ...nonCompactPlayers[1]!, seatIndex: 3 };
    render(
      <LobbyWaitingRoom
        roomName="朋友局"
        currentPlayerId="host"
        players={nonCompactPlayers}
        onSetReady={vi.fn()}
        onStartFirstHand={vi.fn()}
        onReseatPlayer={vi.fn()}
        onShuffleSeats={vi.fn()}
      />,
    );

    expect(screen.getByText('请先随机打乱以整理座位')).toBeInTheDocument();
    expect(screen.getByText('Alice').closest('li')).not.toHaveAttribute(
      'draggable',
      'true',
    );
  });

  it('delegates random seating and disables no-op single-player shuffles', () => {
    const onShuffleSeats = vi.fn();
    const { rerender } = render(
      <LobbyWaitingRoom
        roomName="朋友局"
        currentPlayerId="host"
        players={players(true)}
        onSetReady={vi.fn()}
        onStartFirstHand={vi.fn()}
        onShuffleSeats={onShuffleSeats}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '随机打乱' }));
    expect(onShuffleSeats).toHaveBeenCalledOnce();
    expect(
      screen.getByRole('button', { name: '随机打乱' }).parentElement,
    ).toHaveClass('lobby__seat-action');
    expect(
      screen.getByRole('button', { name: '随机打乱' }).parentElement,
    ).toHaveTextContent('随机打乱拖动玩家卡片交换座位');

    rerender(
      <LobbyWaitingRoom
        roomName="朋友局"
        currentPlayerId="host"
        players={[players(true)[0]!]}
        onSetReady={vi.fn()}
        onStartFirstHand={vi.fn()}
        onShuffleSeats={onShuffleSeats}
      />,
    );
    expect(screen.getByRole('button', { name: '随机打乱' })).toBeDisabled();
  });
});
