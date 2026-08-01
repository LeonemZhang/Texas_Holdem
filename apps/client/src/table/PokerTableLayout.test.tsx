import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PokerTableLayout } from './PokerTableLayout.js';

describe('PokerTableLayout', () => {
  it('keeps the four gameplay regions explicit and accessible', () => {
    render(
      <PokerTableLayout
        roomName="朋友局"
        handLabel="第 8 手"
        seats={<span>Alice 的座位</span>}
        communityCards={<span>翻牌</span>}
        pots={<span>主池 120</span>}
        controls={<button>过牌</button>}
        status={<span>轮到 Alice</span>}
      />,
    );

    expect(screen.getByRole('heading', { name: '朋友局' })).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('玩家座位')).getByText('Alice 的座位'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('公共牌')).getByText('翻牌'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('底池')).getByText('主池 120'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('行动操作区')).getByRole('button', {
        name: '过牌',
      }),
    ).toBeInTheDocument();
  });

  it('uses containment classes instead of a horizontally scrolling table', () => {
    const { container } = render(
      <PokerTableLayout
        roomName="朋友局"
        handLabel="等待中"
        seats={null}
        communityCards={null}
        pots={null}
        controls={null}
      />,
    );
    expect(container.querySelector('.poker-table-page')).toBeInTheDocument();
    expect(container.querySelector('.poker-table__felt')).toBeInTheDocument();
    expect(
      container.querySelector('.poker-table-controls'),
    ).toBeInTheDocument();
  });
});
