import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { BettingControls } from './BettingControls.js';

const legalActions = {
  canFold: true,
  canCheck: false,
  callAmount: 20,
  minimumRaiseTo: 60,
  maximumRaiseTo: 400,
  canAllIn: true,
};

describe('BettingControls', () => {
  it('enables actions only from the server-provided legal action set', () => {
    render(<BettingControls legalActions={legalActions} onAction={vi.fn()} />);
    expect(screen.getByRole('button', { name: '弃牌' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '过牌' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '跟注 20' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '全押' })).toBeEnabled();
    expect(screen.getByText('最小 60 · 最大 400')).toBeInTheDocument();
  });

  it('emits raise-to with an explicit amount inside the server range', () => {
    const onAction = vi.fn();
    render(<BettingControls legalActions={legalActions} onAction={onAction} />);
    fireEvent.change(screen.getByLabelText('加注到'), {
      target: { value: '180' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确认加注' }));
    expect(onAction).toHaveBeenCalledWith({
      type: 'game.raise-to',
      amount: 180,
    });
  });

  it('adds quick chips to the pending raise total and shows contribution details', () => {
    const onAction = vi.fn();
    render(
      <BettingControls
        legalActions={legalActions}
        roundContribution={20}
        handContribution={80}
        currentRoundBet={60}
        onAction={onAction}
      />,
    );

    expect(screen.getByText('本轮已投 20')).toBeInTheDocument();
    expect(screen.getByText('本手累计 80')).toBeInTheDocument();
    expect(screen.getByText('本轮最高 60')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '增加 20 筹码' }));
    fireEvent.click(screen.getByRole('button', { name: '增加 5 筹码' }));
    fireEvent.click(screen.getByRole('button', { name: '确认加注' }));
    expect(onAction).toHaveBeenCalledWith({
      type: 'game.raise-to',
      amount: 85,
    });
  });

  it('locks every action while recovering or when it is not this player turn', () => {
    const { rerender } = render(
      <BettingControls
        legalActions={legalActions}
        disabled
        onAction={vi.fn()}
      />,
    );
    expect(
      screen
        .getAllByRole('button')
        .every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true);
    rerender(<BettingControls legalActions={null} onAction={vi.fn()} />);
    expect(
      screen
        .getAllByRole('button')
        .every((button) => (button as HTMLButtonElement).disabled),
    ).toBe(true);
  });
});
