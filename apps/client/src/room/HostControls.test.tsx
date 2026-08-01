import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HostControls } from './HostControls.js';

const players = [
  { playerId: 'host', nickname: 'Alice' },
  { playerId: 'bob', nickname: 'Bob' },
];

describe('HostControls', () => {
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
    fireEvent.change(screen.getByLabelText('移除玩家'), {
      target: { value: 'bob' },
    });
    expect(screen.getByText('确认将 Bob 移出房间？')).toBeInTheDocument();
    expect(onCommand).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认执行' }));
    expect(onCommand).toHaveBeenCalledWith({
      type: 'room.remove-player',
      targetPlayerId: 'bob',
    });

    fireEvent.click(screen.getByRole('button', { name: '关闭房间' }));
    fireEvent.click(screen.getByRole('button', { name: '确认执行' }));
    expect(onCommand).toHaveBeenCalledWith({ type: 'room.close' });
  });
});
