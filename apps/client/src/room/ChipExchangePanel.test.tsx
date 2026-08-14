import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ChipExchangePanel } from './ChipExchangePanel.js';

const players = [
  { playerId: 'alice', nickname: 'Alice', chips: 1_000 },
  { playerId: 'bob', nickname: 'Bob', chips: 200 },
];
const activityTimeMs = new Date(2026, 7, 5, 12, 34, 56).getTime();
const pendingRecord = {
  kind: 'request' as const,
  requestId: 'r1',
  requesterId: 'bob',
  targetPlayerId: 'alice',
  amount: 200,
  status: 'pending' as const,
  rejectedByPlayerIds: [],
  completedByPlayerId: null,
  createdSequence: 1,
  updatedSequence: 1,
  createdAtMs: activityTimeMs,
  updatedAtMs: activityTimeMs,
};

describe('ChipExchangePanel', () => {
  it('uses the shared single collapse action', () => {
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
    fireEvent.click(screen.getByRole('button', { name: '收起' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('routes non-ready phases to records and exposes the exchange lock', () => {
    render(
      <ChipExchangePanel
        phase="playing"
        currentPlayerId="alice"
        players={players}
        records={[]}
        onAction={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '筹码交换' }));
    expect(screen.getByRole('tab', { name: '公开记录' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    fireEvent.click(screen.getByRole('tab', { name: '筹码交换' }));
    expect(screen.getByText(/当前阶段不能新建请求/)).toBeInTheDocument();
  });

  it('requires a selected player and confirms giving in a modal', () => {
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
    fireEvent.click(screen.getByRole('button', { name: '筹码交换' }));
    expect(screen.queryByRole('option', { name: '任意玩家' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '准备给予' }));
    expect(
      screen.getByRole('alertdialog', { name: '确认筹码操作' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('给予 Bob 100 筹码，余额将变为 900'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '取消' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: '确认' }));
    expect(onAction).toHaveBeenCalledWith({
      type: 'give',
      receiverPlayerId: 'bob',
      amount: 100,
    });
  });

  it('auto-opens incoming records and preserves terminal and direct history', () => {
    const onAction = vi.fn();
    const { rerender } = render(
      <ChipExchangePanel
        phase="hand-ready"
        currentPlayerId="alice"
        players={players}
        records={[
          pendingRecord,
          {
            ...pendingRecord,
            requestId: 'r2',
            status: 'rejected',
            updatedSequence: 2,
            updatedAtMs: new Date(2026, 7, 5, 12, 35, 1).getTime(),
          },
          {
            kind: 'direct-transfer',
            transferId: 't1',
            fromPlayerId: 'alice',
            toPlayerId: 'bob',
            amount: 50,
            completedSequence: 3,
            completedAtMs: new Date(2026, 7, 5, 12, 35, 7).getTime(),
          },
        ]}
        onAction={onAction}
      />,
    );
    expect(
      screen.getByText(/Bob 向 Alice 请求 200 · 已拒绝/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Alice 给予 Bob 50 · 已完成/)).toBeInTheDocument();
    expect(screen.getByText('12:34:56')).toBeInTheDocument();
    expect(screen.getByText('12:35:01')).toBeInTheDocument();
    expect(screen.getByText('12:35:07')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '同意' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '拒绝' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'reject', requestId: 'r1' });

    rerender(
      <ChipExchangePanel
        phase="hand-ready"
        currentPlayerId="bob"
        players={players}
        records={[pendingRecord]}
        onAction={onAction}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '筹码交换' }));
    fireEvent.click(screen.getByRole('button', { name: '撤销' }));
    expect(onAction).toHaveBeenCalledWith({ type: 'revoke', requestId: 'r1' });
  });

  it('closes after approving an incoming request', () => {
    const onAction = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ChipExchangePanel
        phase="hand-ready"
        currentPlayerId="alice"
        players={players}
        records={[pendingRecord]}
        presentation="drawer"
        open
        onOpenChange={onOpenChange}
        onAction={onAction}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '同意' }));
    fireEvent.click(screen.getByRole('button', { name: '确认' }));

    expect(onAction).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'approve', requestId: 'r1' }),
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes after the requester confirms a chip request', () => {
    const onAction = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ChipExchangePanel
        phase="hand-ready"
        currentPlayerId="alice"
        players={players}
        records={[]}
        presentation="drawer"
        open
        onOpenChange={onOpenChange}
        onAction={onAction}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '发起请求' }));
    fireEvent.click(screen.getByRole('button', { name: '确认' }));

    expect(onAction).toHaveBeenCalledWith({
      type: 'request',
      targetPlayerId: 'bob',
      amount: 100,
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closes after rejecting an incoming request', () => {
    const onAction = vi.fn();
    const onOpenChange = vi.fn();
    render(
      <ChipExchangePanel
        phase="hand-ready"
        currentPlayerId="alice"
        players={players}
        records={[pendingRecord]}
        presentation="drawer"
        open
        onOpenChange={onOpenChange}
        onAction={onAction}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '拒绝' }));

    expect(onAction).toHaveBeenCalledWith({ type: 'reject', requestId: 'r1' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
