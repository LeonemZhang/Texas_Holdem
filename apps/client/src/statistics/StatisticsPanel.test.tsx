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
  participatedHands: 12,
  wonHands: 4,
  largestSingleHandProfit: 350,
  largestWonPot: 500,
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
    expect(rows[0]).toHaveTextContent('#1 Bob');
    expect(rows[1]).toHaveTextContent('#2 Alice');
    expect(rows[0]).toHaveTextContent('60% (5 次)');
    expect(rows[0]).toHaveTextContent('3 / 2 / 6 / 4 / 1');
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
