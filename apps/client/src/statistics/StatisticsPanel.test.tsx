import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  StatisticsPanel,
  type PlayerStatisticsView,
} from './StatisticsPanel.js';

const player = (
  playerId: string,
  nickname: string,
  chips: number,
): PlayerStatisticsView => ({
  playerId,
  nickname,
  initialChips: 1_000,
  currentChips: chips,
  netWinLoss: chips - 1_000,
  participatedHands: 12,
  wonHands: 4,
  largestSingleHandProfit: 350,
  largestSingleHandLoss: 500,
  showdownCount: 5,
  showdownWinRate: 0.6,
  actions: { fold: 3, check: 2, call: 6, raiseTo: 4, allIn: 1 },
});

describe('StatisticsPanel', () => {
  it('ranks players in the default statistics tab', () => {
    render(
      <StatisticsPanel
        open
        players={[player('a', 'Alice', 800), player('b', 'Bob', 1_200)]}
        titles={[]}
        onCollapse={vi.fn()}
      />,
    );
    const ranking = screen.getByRole('tabpanel', { name: '牌局统计' });
    const rows = within(ranking).getAllByRole('listitem');
    const topRow = rows[0]!;
    expect(topRow).toHaveTextContent('#1 Bob');
    expect(rows[1]).toHaveTextContent('#2 Alice');
    expect(topRow).toHaveTextContent('60% (5 次)');
    expect(topRow).toHaveTextContent('3 / 2 / 6 / 4 / 1');
    expect(topRow).toHaveTextContent('净输赢（不含交换筹码）+200');
    expect(
      within(topRow).getByText('净输赢（不含交换筹码）').parentElement,
    ).toHaveClass('statistics-ranking__net-win-loss');
    expect(
      within(topRow)
        .getAllByRole('term')
        .map((term) => term.textContent),
    ).toEqual([
      '净输赢（不含交换筹码）',
      '参与/获胜',
      '最大单局盈利',
      '最大单局输掉',
      '摊牌胜率',
      '弃 / 过 / 跟 / 加 / 全押',
    ]);
  });

  it('uses settlement-only net win or loss rather than exchanged chips', () => {
    render(
      <StatisticsPanel
        open
        players={[
          {
            ...player('a', 'Alice', 100),
            netWinLoss: 500,
          },
        ]}
        titles={[]}
        onCollapse={vi.fn()}
      />,
    );

    expect(screen.getByText('净输赢（不含交换筹码）')).toBeInTheDocument();
    expect(screen.getByText('+500')).toBeInTheDocument();
  });

  it('switches to all tied titles and supports keyboard tabs', () => {
    render(
      <StatisticsPanel
        open
        players={[player('a', 'Alice', 1_000), player('b', 'Bob', 1_000)]}
        titles={[
          { title: 'all-in-king', playerIds: ['a', 'b'], value: 3 },
          { title: 'unlucky-player', playerIds: [], value: null },
        ]}
        onCollapse={vi.fn()}
      />,
    );
    const statisticsTab = screen.getByRole('tab', { name: '牌局统计' });
    fireEvent.keyDown(statisticsTab, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: '局内称号' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByText('Alice、Bob')).toBeInTheDocument();
    expect(screen.getByText('All-in 之王')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '说明：All-in 之王' }));
    expect(screen.getByRole('tooltip')).toHaveTextContent('全押次数最多。');
  });

  it('shows the authoritative global owner and five cards in hand records', () => {
    render(
      <StatisticsPanel
        open
        players={[player('a', 'Alice', 1_000), player('b', 'Bob', 1_000)]}
        titles={[]}
        handPeaks={{
          global: {
            handType: 'three-of-a-kind',
            playerIds: ['a'],
            bestFiveCards: ['Qd', '2s', 'Kh', '2h', '2c'],
          },
          players: [
            {
              playerId: 'a',
              handType: 'one-pair',
              bestFiveCards: ['Kc', 'Tc', '9h', '9d', 'Qh'],
            },
            {
              playerId: 'b',
              handType: 'one-pair',
              bestFiveCards: ['Ac', 'Ad', 'Ks', 'Qh', 'Jc'],
            },
          ],
          hasLegacyCoverageGap: false,
        }}
        onCollapse={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('tab', { name: '牌型记录' }));
    expect(screen.getByText('本局最高牌型')).toBeInTheDocument();
    expect(screen.getByText('归属：Alice')).toBeInTheDocument();
    expect(screen.getByLabelText('本局最高牌型第 1 张 2♠')).toBeInTheDocument();
    expect(screen.getByLabelText('本局最高牌型第 4 张 K♥')).toBeInTheDocument();
    expect(
      screen.getByLabelText('Alice 的最高牌型第 1 张 9♥'),
    ).toBeInTheDocument();
    expect(
      screen.getByLabelText('Alice 的最高牌型第 3 张 K♣'),
    ).toBeInTheDocument();
    expect(
      screen
        .getAllByRole('listitem')
        .filter((item) => item.classList.contains('statistics-hands__player')),
    ).toHaveLength(2);
  });

  it('has one collapse action and can expand from its compact tab', () => {
    const onCollapse = vi.fn();
    const onExpand = vi.fn();
    const { rerender } = render(
      <StatisticsPanel open players={[]} titles={[]} onCollapse={onCollapse} />,
    );
    expect(screen.queryByLabelText('关闭统计')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '收起' }));
    expect(onCollapse).toHaveBeenCalledOnce();
    rerender(
      <StatisticsPanel
        open
        collapsed
        players={[]}
        titles={[]}
        onCollapse={onCollapse}
        onExpand={onExpand}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '统计' }));
    expect(onExpand).toHaveBeenCalledOnce();
  });

  it('stays absent while closed', () => {
    render(
      <StatisticsPanel
        open={false}
        players={[]}
        titles={[]}
        onCollapse={vi.fn()}
      />,
    );
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });
});
