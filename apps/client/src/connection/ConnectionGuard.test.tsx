import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConnectionGuard } from './ConnectionGuard.js';

describe('ConnectionGuard', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('locks duplicate game operations while recovering', () => {
    render(
      <ConnectionGuard
        state={{ status: 'recovering', reason: '网络暂时不可达' }}
        onRetry={vi.fn()}
        onExitRoom={vi.fn()}
        clearReconnectSession={vi.fn()}
      >
        <button type="button">下注</button>
      </ConnectionGuard>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('正在恢复');
    expect(screen.getByRole('button', { name: '下注' })).toBeDisabled();
    expect(screen.getByText(/座位和数据会保留/)).toBeInTheDocument();
  });

  it('shows actionable connection errors', () => {
    const onRetry = vi.fn();
    render(
      <ConnectionGuard
        state={{ status: 'failed', error: '版本不兼容' }}
        onRetry={onRetry}
        onExitRoom={vi.fn()}
        clearReconnectSession={vi.fn()}
      >
        <span>牌桌</span>
      </ConnectionGuard>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('版本不兼容');
    fireEvent.click(screen.getByRole('button', { name: '重试' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it('clears the reconnect identity only after confirmed active exit', () => {
    const onExitRoom = vi.fn();
    const clearReconnectSession = vi.fn();
    render(
      <ConnectionGuard
        state={{ status: 'connected' }}
        onRetry={vi.fn()}
        onExitRoom={onExitRoom}
        clearReconnectSession={clearReconnectSession}
      >
        <span>牌桌</span>
      </ConnectionGuard>,
    );
    expect(clearReconnectSession).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '退出房间' }));
    expect(clearReconnectSession).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认退出' }));
    expect(clearReconnectSession).toHaveBeenCalledOnce();
    expect(onExitRoom).toHaveBeenCalledOnce();
  });

  it('expands the compact exit action before showing mobile confirmation', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    render(
      <ConnectionGuard
        state={{ status: 'connected' }}
        onRetry={vi.fn()}
        onExitRoom={vi.fn()}
        clearReconnectSession={vi.fn()}
      >
        <span>牌桌</span>
      </ConnectionGuard>,
    );

    const exitAction = screen.getByRole('button', { name: '退出房间' });
    expect(exitAction).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(exitAction);
    expect(exitAction).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    fireEvent.click(exitAction);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});
