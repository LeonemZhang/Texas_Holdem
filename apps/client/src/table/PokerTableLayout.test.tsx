import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PokerTableLayout } from './PokerTableLayout.js';

describe('PokerTableLayout', () => {
  it('keeps the four gameplay regions explicit and accessible', () => {
    render(
      <PokerTableLayout
        roomName="朋友局"
        handLabel="第 8 局 · 翻牌前 · 当前行动：Alice"
        seats={<span>Alice 的座位</span>}
        communityCards={<span>翻牌</span>}
        actionTimer={<span>轮到 Alice · 18s</span>}
        controls={<button>过牌</button>}
        status={<span>轮到 Alice</span>}
        utilityPanel={<section>筹码交换内容</section>}
      />,
    );

    expect(screen.getByRole('heading', { name: '朋友局' })).toBeInTheDocument();
    const gameStatus = screen.getByLabelText('牌局进度');
    expect(gameStatus).toHaveTextContent('第 8 局 · 翻牌前 · 当前行动：Alice');
    expect(gameStatus).toHaveAttribute(
      'title',
      '第 8 局 · 翻牌前 · 当前行动：Alice',
    );
    expect(gameStatus.closest('.poker-table__felt')).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('玩家座位')).getByText('Alice 的座位'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('公共牌')).getByText('翻牌'),
    ).toBeInTheDocument();
    expect(screen.getByText('轮到 Alice · 18s')).toBeInTheDocument();
    expect(screen.getByLabelText('牌桌工具面板')).toHaveTextContent(
      '筹码交换内容',
    );
    expect(document.querySelector('.poker-table-page')).toHaveClass(
      'poker-table-page--utility-open',
    );
    expect(
      within(screen.getByLabelText('行动操作区')).getByRole('button', {
        name: '过牌',
      }),
    ).toBeInTheDocument();
  });

  it('uses containment classes and omits controls when there is no active action', () => {
    const { container } = render(
      <PokerTableLayout
        roomName="朋友局"
        handLabel="等待中"
        seats={null}
        communityCards={null}
        controls={null}
      />,
    );
    expect(container.querySelector('.poker-table-page')).toBeInTheDocument();
    expect(
      container.querySelector('.poker-table-page__workspace'),
    ).toBeInTheDocument();
    expect(container.querySelector('.poker-table__felt')).toBeInTheDocument();
    expect(container.querySelector('.poker-table-controls')).toBeNull();
  });
});
