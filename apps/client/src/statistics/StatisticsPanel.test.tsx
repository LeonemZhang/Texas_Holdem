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
  it('ranks players by chips and displays full basic statistics', () => {
    render(
      <StatisticsPanel
        open
        players={[player('a', 'Alice', 800), player('b', 'Bob', 1_200)]}
        titles={[]}
        onClose={vi.fn()}
      />,
    );
    const ranking = screen.getByRole('list', { name: '筹码排名' });
    const rows = within(ranking).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('#1 Bob');
    expect(rows[1]).toHaveTextContent('#2 Alice');
    expect(rows[0]).toHaveTextContent('最大单手盈利');
    expect(rows[0]).toHaveTextContent('60% (5 次)');
    expect(rows[0]).toHaveTextContent('3 / 2 / 6 / 4 / 1');
  });

  it('shows all title labels and keeps tied winners together', () => {
    render(
      <StatisticsPanel
        open
        players={[player('a', 'Alice', 1_000), player('b', 'Bob', 1_000)]}
        titles={[
          { title: 'all-in-king', playerIds: ['a', 'b'], value: 3 },
          { title: 'unlucky-player', playerIds: [], value: null },
          { title: 'pot-harvester', playerIds: ['a'], value: 900 },
          { title: 'double-up-master', playerIds: ['a'], value: 500 },
          { title: 'bluff-king', playerIds: ['b'], value: 2 },
          { title: 'river-killer', playerIds: ['b'], value: 1 },
          { title: 'tight-player', playerIds: ['a'], value: 0.7 },
        ]}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByText('Alice、Bob')).toBeInTheDocument();
    for (const title of [
      'All-in 之王',
      '倒霉蛋',
      '底池收割机',
      '翻倍大师',
      '偷鸡王',
      '河牌杀手',
      '铁公鸡',
    ]) {
      expect(screen.getByText(title)).toBeInTheDocument();
    }
  });

  it('acts as a closable drawer and stays absent while closed', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <StatisticsPanel open players={[]} titles={[]} onClose={onClose} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '关闭统计' }));
    expect(onClose).toHaveBeenCalledOnce();
    rerender(
      <StatisticsPanel
        open={false}
        players={[]}
        titles={[]}
        onClose={onClose}
      />,
    );
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });

  it('can collapse into a compact statistics tab and expand again', () => {
    const onCollapse = vi.fn();
    const onExpand = vi.fn();
    const { rerender } = render(
      <StatisticsPanel
        open
        players={[]}
        titles={[]}
        onClose={vi.fn()}
        onCollapse={onCollapse}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '收起' }));
    expect(onCollapse).toHaveBeenCalledOnce();
    rerender(
      <StatisticsPanel
        open
        collapsed
        players={[]}
        titles={[]}
        onClose={vi.fn()}
        onExpand={onExpand}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '统计' }));
    expect(onExpand).toHaveBeenCalledOnce();
  });
});
