import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HostControls } from './HostControls.js';

const players = [
  { playerId: 'host', nickname: 'Alice' },
  { playerId: 'bob', nickname: 'Bob' },
];

describe('HostControls', () => {
  it('shows the room link and copyable QR code in the game management drawer', () => {
    render(
      <HostControls
        isHost
        hostPlayerId="host"
        phase="playing"
        players={players}
        joinUrl="http://10.126.126.1:32100/?room=room-1"
        onCommand={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '房主管理' }));
    expect(screen.getByRole('button', { name: '复制邀请链接' })).toHaveClass(
      'button--secondary',
    );
    expect(screen.getByRole('button', { name: '复制二维码' })).toHaveClass(
      'copyable-qr-code__button',
    );
    expect(screen.getByTitle('加入房间二维码')).toBeInTheDocument();
  });

  it('supports a room-controlled drawer state', () => {
    const onOpenChange = vi.fn();
    render(
      <HostControls
        isHost
        hostPlayerId="host"
        phase="playing"
        players={players}
        presentation="drawer"
        open
        onOpenChange={onOpenChange}
        onCommand={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '收起' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not expose management actions to ordinary players', () => {
    const { container } = render(
      <HostControls
        isHost={false}
        hostPlayerId="host"
        phase="playing"
        players={players}
        onCommand={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('sends pause and resume only through command callbacks', () => {
    const onCommand = vi.fn();
    const { rerender } = render(
      <HostControls
        isHost
        hostPlayerId="host"
        phase="playing"
        players={players}
        onCommand={onCommand}
      />,
    );
    expect(
      screen.queryByRole('button', { name: '暂停游戏' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '房主管理' }));
    expect(screen.getByRole('button', { name: '暂停游戏' })).toHaveClass(
      'host-controls__button--pause',
    );
    fireEvent.click(screen.getByRole('button', { name: '暂停游戏' }));
    expect(onCommand).toHaveBeenCalledWith({ type: 'room.pause' });
    rerender(
      <HostControls
        isHost
        hostPlayerId="host"
        phase="paused"
        players={players}
        onCommand={onCommand}
      />,
    );
    expect(screen.getByRole('button', { name: '继续游戏' })).toHaveClass(
      'host-controls__button--resume',
    );
    fireEvent.click(screen.getByRole('button', { name: '继续游戏' }));
    expect(onCommand).toHaveBeenCalledWith({ type: 'room.resume' });
  });

  it('requires confirmation before removing a player or closing the room', () => {
    const onCommand = vi.fn();
    render(
      <HostControls
        isHost
        hostPlayerId="host"
        phase="lobby"
        players={players}
        onCommand={onCommand}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '房主管理' }));
    const gameControls = screen.getByRole('group', { name: '游戏控制' });
    expect(
      within(gameControls).getByRole('button', { name: '暂停游戏' }),
    ).toHaveClass('host-controls__button--pause');
    expect(
      within(gameControls).getByRole('button', { name: '结束游戏' }),
    ).toHaveClass('host-controls__button--end');
    expect(screen.getByLabelText('房间玩家列表')).toHaveTextContent(
      'Alice房主Bob踢出',
    );
    expect(screen.getByRole('button', { name: '踢出 Bob' })).toHaveClass(
      'host-controls__button--kick',
    );
    fireEvent.click(screen.getByRole('button', { name: '踢出 Bob' }));
    expect(screen.getByText('确认将 Bob 移出房间？')).toBeInTheDocument();
    expect(onCommand).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认执行' }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'room.remove-player',
      targetPlayerId: 'bob',
    });

    fireEvent.click(screen.getByRole('button', { name: '结束游戏' }));
    fireEvent.click(screen.getByRole('button', { name: '确认执行' }));
    expect(onCommand).toHaveBeenCalledWith({ type: 'room.close' });
  });

  it('defers player removal until the current hand has ended', () => {
    render(
      <HostControls
        isHost
        hostPlayerId="host"
        phase="playing"
        players={players}
        onCommand={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '房主管理' }));
    expect(screen.getByRole('button', { name: '踢出 Bob' })).toBeDisabled();
    expect(screen.getByText('每局结束后可移除')).toBeInTheDocument();
  });

  it('lets the Host initiate a chip reset vote during hand readiness', () => {
    const onCommand = vi.fn();
    render(
      <HostControls
        isHost
        hostPlayerId="host"
        phase="hand-ready"
        players={players}
        settings={{
          roomName: 'Friends',
          maxPlayers: 4,
          initialChips: 100,
          smallBlind: 1,
          actionTimeoutSeconds: 30,
          handReadyTimeoutSeconds: 30,
          blindGrowth: { enabled: false, intervalHands: 10, multiplier: 2 },
          zeroChipPolicy: 'request-chips',
        }}
        onCommand={onCommand}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '房主管理' }));
    const gameControls = screen.getByRole('group', { name: '游戏控制' });
    expect(
      within(gameControls).getByRole('button', { name: '修改房间配置' }),
    ).toHaveClass('host-controls__button--settings');
    const button = within(gameControls).getByRole('button', {
      name: '发起筹码重置投票',
    });
    expect(button).toHaveClass('host-controls__button--vote');
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onCommand).toHaveBeenCalledWith({
      type: 'room.start-chip-reset-vote',
    });
  });

  it('disables the reset vote when the room eliminates depleted players', () => {
    render(
      <HostControls
        isHost
        hostPlayerId="host"
        phase="hand-ready"
        players={players}
        settings={{
          roomName: 'Friends',
          maxPlayers: 4,
          initialChips: 100,
          smallBlind: 1,
          actionTimeoutSeconds: 30,
          handReadyTimeoutSeconds: 30,
          blindGrowth: { enabled: false, intervalHands: 10, multiplier: 2 },
          zeroChipPolicy: 'eliminate',
        }}
        onCommand={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '房主管理' }));
    expect(
      screen.getByRole('button', { name: '发起筹码重置投票' }),
    ).toBeDisabled();
  });
});
