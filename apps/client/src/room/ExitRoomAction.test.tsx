import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ExitRoomAction } from './ExitRoomAction.js';

describe('ExitRoomAction', () => {
  it('arms from the compact icon and resets when focus leaves the action', () => {
    render(<ExitRoomAction onConfirm={vi.fn()} />);

    const action = screen.getByRole('button', { name: '退出房间' });
    expect(action).toHaveTextContent('×');
    expect(action).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(action);
    expect(action).toHaveTextContent('退出房间');
    expect(action).toHaveAttribute('aria-expanded', 'true');

    fireEvent.pointerDown(document.body);
    expect(action).toHaveTextContent('×');

    fireEvent.click(action);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(action).toHaveTextContent('×');
  });

  it('opens confirmation only after the second click and confirms through the callback', () => {
    const onConfirm = vi.fn();
    render(<ExitRoomAction onConfirm={onConfirm} />);

    const action = screen.getByRole('button', { name: '退出房间' });
    fireEvent.click(action);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    fireEvent.click(action);
    expect(
      screen.getByRole('alertdialog', { name: '确认退出房间' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('alertdialog')).toHaveTextContent(
      '退出后仍可用原设备恢复',
    );

    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(action).toHaveTextContent('×');

    fireEvent.click(action);
    fireEvent.click(action);
    fireEvent.click(screen.getByRole('button', { name: '确认退出' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});
