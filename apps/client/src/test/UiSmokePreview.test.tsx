import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { UiSmokePreview, uiSmokePreviewPages } from './UiSmokePreview.js';

afterEach(cleanup);

describe('UiSmokePreview', () => {
  it.each(uiSmokePreviewPages)('renders the current %s preview', (page) => {
    const { container } = render(<UiSmokePreview page={page} />);

    expect(container).not.toBeEmptyDOMElement();
  });

  it('exercises the current action-order and hand-peak presentation', () => {
    render(<UiSmokePreview page="table" />);
    expect(screen.getAllByText('行动顺位 1').length).toBeGreaterThan(0);
    expect(
      screen.getAllByRole('button', {
        name: /快速加注到剩余筹码的/,
      }),
    ).toHaveLength(6);
    expect(
      screen.getByRole('button', {
        name: /快速加注到剩余筹码的 1\/3/,
      }),
    ).toBeInTheDocument();

    cleanup();
    render(<UiSmokePreview page="statistics" />);
    fireEvent.click(screen.getByRole('tab', { name: '牌型记录' }));
    expect(screen.getByText('最高牌型')).toBeInTheDocument();
  });

  it('provides an interactive eight-player queue scroll preview', () => {
    const { container } = render(<UiSmokePreview page="table-8-scroll" />);

    expect(
      container.querySelectorAll('[data-mobile-queue-player-id]'),
    ).toHaveLength(8);
    expect(screen.getByText('当前行动：玩家 4')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '下一位' }));

    expect(screen.getByText('当前行动：玩家 5')).toBeInTheDocument();
  });

  it('uses the formal table toolbar styles for preview controls', () => {
    const { container } = render(<UiSmokePreview page="table-8-scroll" />);

    expect(
      container.querySelector('.poker-table-page__header-actions'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('.poker-table-page__utility-actions'),
    ).toBeInTheDocument();
    expect(container.querySelector('[class*="table-preview"]')).toBeNull();
  });

  it('renders the settlement sound preview', () => {
    render(<UiSmokePreview page="sound" />);

    expect(
      screen.getByRole('button', { name: '试听持平音效' }),
    ).toBeInTheDocument();
  });

  it.each([
    ['table-6', ['3']],
    ['table-7', ['3', '4']],
    ['table-8', ['4']],
    ['table-9', ['4', '5']],
  ] as const)(
    'fills top seats for %s with complete preview content',
    (page, positions) => {
      const { container } = render(<UiSmokePreview page={page} />);

      for (const position of positions) {
        const seat = container.querySelector<HTMLElement>(
          `.table-seat[data-seat-position="${position}"]`,
        );
        expect(seat).toHaveClass('table-seat--active');
        expect(seat).toHaveTextContent(/小盲|大盲/);
        expect(seat).toHaveTextContent('在局');
        expect(
          seat?.querySelector('.table-seat__last-action'),
        ).toHaveTextContent('跟注');
      }
    },
  );

  it('keeps the disabled betting area and restores the board after settlement collapse', () => {
    const { container } = render(<UiSmokePreview page="settlement" />);

    expect(screen.getByText('第 9 局结算 · 摊牌')).toBeInTheDocument();
    expect(screen.getByLabelText('行动操作区')).toBeInTheDocument();
    expect(container.querySelector('.betting-controls')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(screen.queryByLabelText('本局底池')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: '收起结算详情' }));

    expect(screen.getByLabelText('本局底池')).toBeInTheDocument();
  });

  it('opens the nickname dialog when the discovery preview joins a room', () => {
    render(<UiSmokePreview page="room-discovery" />);

    fireEvent.click(screen.getByRole('button', { name: '加入' }));

    expect(
      screen.getByRole('dialog', { name: '加入“周末牌局”' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('玩家昵称')).toHaveValue('Bob');
  });
});
