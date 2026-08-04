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
  it('keeps raise adjustment as a draft until the separate submit action', () => {
    const onAction = vi.fn();
    render(
      <BettingControls
        legalActions={{
          canFold: true,
          canCheck: false,
          callAmount: 20,
          minimumRaiseTo: 60,
          maximumRaiseTo: 400,
          canAllIn: true,
        }}
        onAction={onAction}
      />,
    );

    const toggle = screen.getByRole('button', { name: /调整加注/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(onAction).not.toHaveBeenCalled();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(document.querySelector('.raise-control--open')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('加注增量'), {
      target: { value: '120' },
    });
    fireEvent.click(screen.getByRole('button', { name: '关闭加注设置' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '确认加注 180' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: '确认加注 180' }));
    expect(onAction).toHaveBeenCalledWith({
      type: 'game.raise-to',
      amount: 180,
    });
  });

  it('submits the minimum legal raise before any draft adjustment', () => {
    const onAction = vi.fn();
    render(<BettingControls legalActions={legalActions} onAction={onAction} />);

    fireEvent.click(screen.getByRole('button', { name: '确认加注 60' }));
    expect(onAction).toHaveBeenCalledWith({
      type: 'game.raise-to',
      amount: 60,
    });
  });

  it('clamps a retained draft when the legal raise range narrows', () => {
    const onAction = vi.fn();
    const { rerender } = render(
      <BettingControls legalActions={legalActions} onAction={onAction} />,
    );
    fireEvent.change(screen.getByLabelText('加注增量'), {
      target: { value: '300' },
    });

    rerender(
      <BettingControls
        legalActions={{
          ...legalActions,
          minimumRaiseTo: 80,
          maximumRaiseTo: 140,
        }}
        onAction={onAction}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '确认加注 140' }));
    expect(onAction).toHaveBeenCalledWith({
      type: 'game.raise-to',
      amount: 140,
    });
  });

  it('enables actions only from the server-provided legal action set', () => {
    render(<BettingControls legalActions={legalActions} onAction={vi.fn()} />);
    expect(screen.getByRole('button', { name: '弃牌' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '过牌' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '跟注 20' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '全押' })).toBeEnabled();
    expect(screen.getByText('最小 60 · 最大 400')).toBeInTheDocument();
    expect(
      screen.getByText('20', { selector: '.betting-controls__call-amount' }),
    ).toBeInTheDocument();
  });

  it.each([1, 40, 1000])(
    'keeps call amount %i in the inline amount badge',
    (callAmount) => {
      const onAction = vi.fn();
      render(
        <BettingControls
          legalActions={{ ...legalActions, callAmount }}
          onAction={onAction}
        />,
      );

      const button = screen.getByRole('button', {
        name: `跟注 ${callAmount}`,
      });
      expect(button).toHaveClass('betting-controls__call');
      expect(
        button.querySelector('.betting-controls__call-amount'),
      ).toHaveTextContent(String(callAmount));
      fireEvent.click(button);
      expect(onAction).toHaveBeenCalledWith({ type: 'game.call' });
    },
  );

  it('emits raise-to with an explicit amount inside the server range', () => {
    const onAction = vi.fn();
    render(<BettingControls legalActions={legalActions} onAction={onAction} />);
    fireEvent.change(screen.getByLabelText('加注增量'), {
      target: { value: '120' },
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

  it('sets a quick chip as the raise target before adding later chips', () => {
    const onAction = vi.fn();
    render(<BettingControls legalActions={legalActions} onAction={onAction} />);

    fireEvent.click(screen.getByRole('button', { name: '增加 100 筹码' }));
    fireEvent.click(screen.getByRole('button', { name: '确认加注' }));
    expect(onAction).toHaveBeenLastCalledWith({
      type: 'game.raise-to',
      amount: 100,
    });

    fireEvent.click(screen.getByRole('button', { name: '增加 100 筹码' }));
    fireEvent.click(screen.getByRole('button', { name: '确认加注' }));
    expect(onAction).toHaveBeenLastCalledWith({
      type: 'game.raise-to',
      amount: 200,
    });
  });

  it('starts the raise slider at zero increment and can clear the selected chips', () => {
    const onAction = vi.fn();
    render(<BettingControls legalActions={legalActions} onAction={onAction} />);
    const slider = screen.getByLabelText('加注增量');
    expect(slider).toHaveAttribute('min', '0');
    expect(slider).toHaveValue('0');
    fireEvent.click(screen.getByRole('button', { name: '增加 20 筹码' }));
    expect(slider).toHaveValue('20');
    fireEvent.click(screen.getByRole('button', { name: '减少 5 筹码' }));
    expect(slider).toHaveValue('15');
    fireEvent.click(screen.getByRole('button', { name: '清零' }));
    expect(slider).toHaveValue('0');
    expect(screen.getByText('加注至 60')).toBeInTheDocument();
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
