import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChipExchangePanel } from './ChipExchangePanel.js';

const players = [
  { playerId: 'alice', nickname: 'Alice', chips: 1_000 },
  { playerId: 'bob', nickname: 'Bob', chips: 0 },
];

describe('ChipExchangePanel', () => {
  it('supports a room-controlled drawer state', () => {
    const onOpenChange = vi.fn();
    render(
      <ChipExchangePanel
        phase="playing"
        currentPlayerId="alice"
        players={players}
        records={[]}
        presentation="drawer"
        open
        onOpenChange={onOpenChange}
        onAction={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '关闭筹码交换' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps the exchange interactions collapsed until requested', () => {
    render(
      <ChipExchangePanel
        phase="playing"
        currentPlayerId="alice"
        players={players}
        records={[]}
        onAction={vi.fn()}
      />,
    );
    expect(
      screen.queryByText(
        '对局进行中不能新建请求或主动给予筹码；已收到的请求仍可批准、拒绝或撤销，批准后立即同步余额。',
      ),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '准备给予' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '展开筹码交换' }));
    expect(
      screen.getByText(
        '对局进行中不能新建请求或主动给予筹码；已收到的请求仍可批准、拒绝或撤销，批准后立即同步余额。',
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '准备给予' }),
    ).not.toBeInTheDocument();
  });

  it('previews the resulting balance and requires a second confirmation', () => {
    const onAction = vi.fn();
    render(
      <ChipExchangePanel
        phase="hand-ready"
        currentPlayerId="alice"
        players={players}
        records={[]}
        onAction={onAction}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '展开筹码交换' }));
    fireEvent.change(screen.getByLabelText('给予玩家'), {
      target: { value: 'bob' },
    });
    fireEvent.click(screen.getByRole('button', { name: '准备给予' }));
    expect(
      screen.getByText('给予 Bob 100 筹码，余额将变为 900'),
    ).toBeInTheDocument();
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    expect(onAction).toHaveBeenCalledWith({
      type: 'give',
      receiverPlayerId: 'bob',
      amount: 100,
    });
  });

  it('shows pending public records with approve, reject and revoke actions', () => {
    const onAction = vi.fn();
    const record = {
      requestId: 'r1',
      requesterId: 'bob',
      targetPlayerId: 'alice',
      amount: 200,
      status: 'pending' as const,
    };
    const { rerender } = render(
      <ChipExchangePanel
        phase="hand-ready"
        currentPlayerId="alice"
        players={players}
        records={[record]}
        onAction={onAction}
      />,
    );
    expect(
      screen.getByText(/Bob 向 Alice 请求 200 · 待处理/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '拒绝' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'reject', requestId: 'r1' });

    rerender(
      <ChipExchangePanel
        phase="hand-ready"
        currentPlayerId="bob"
        players={players}
        records={[record]}
        onAction={onAction}
      />,
    );
    expect(
      screen.getByRole('button', { name: '收起筹码交换' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '撤销' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'revoke', requestId: 'r1' });
  });
});
