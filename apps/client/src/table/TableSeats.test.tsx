import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TableSeats, type TableSeatPlayer } from './TableSeats.js';

function makePlayers(count: number): TableSeatPlayer[] {
  return Array.from({ length: count }, (_, index) => ({
    playerId: `p${index}`,
    nickname: `玩家 ${index + 1}`,
    seatIndex: index,
    chips: 1_000 - index * 10,
    status:
      index === 1
        ? 'disconnected'
        : index === 2
          ? 'all-in'
          : index === 3
            ? 'folded'
            : 'active',
    isCurrentActor: index === 0,
    isDealer: index === count - 1,
    isSmallBlind: index === 0,
    isBigBlind: index === 1,
  }));
}

function mobileQueuePlayerIds(container: HTMLElement): string[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('[data-mobile-queue-player-id]'),
  ).map((element) => element.dataset.mobileQueuePlayerId!);
}

function setElementMetric(
  element: Element,
  property: 'clientWidth' | 'scrollWidth' | 'offsetLeft',
  value: number,
) {
  Object.defineProperty(element, property, { configurable: true, value });
}

describe('TableSeats', () => {
  it.each([
    [2, 'heads-up'],
    [3, 'three-handed'],
    [10, 'multi-handed'],
  ])('uses the expected layout for %i players', (count, layout) => {
    render(<TableSeats players={makePlayers(count)} ownPlayerId="p0" />);
    const seats = screen.getByRole('list', { name: `${count} 人座位布局` });
    expect(seats).toHaveAttribute('data-layout', layout);
    expect(screen.getAllByRole('listitem')).toHaveLength(count);
  });

  it('distinguishes acting, disconnected, all-in and folded seats', () => {
    const { container } = render(
      <TableSeats players={makePlayers(4)} ownPlayerId="p0" />,
    );
    expect(container.querySelector('.table-seat--acting')).toHaveTextContent(
      '玩家 1',
    );
    expect(container.querySelector('.table-seat--acting')).toHaveTextContent(
      '行动中',
    );
    expect(screen.getAllByText('小盲')).toHaveLength(2);
    expect(screen.getByText('大盲')).toBeInTheDocument();
    expect(
      container.querySelector('.table-seat--disconnected'),
    ).toHaveTextContent('已掉线');
    expect(container.querySelector('.table-seat--all-in')).toHaveTextContent(
      '全押',
    );
    expect(container.querySelector('.table-seat--folded')).toHaveTextContent(
      '已弃牌',
    );
  });

  it('keeps the round order while the actor advances without moving desktop seats', () => {
    const initialPlayers = makePlayers(4).map((player, index) => ({
      ...player,
      actionOrder: [3, 1, 2, null][index],
      isCurrentActor: player.playerId === 'p1',
    }));
    const { container, rerender } = render(
      <TableSeats
        actionRoundKey="hand-1:flop"
        players={initialPlayers}
        ownPlayerId="p0"
      />,
    );
    expect(mobileQueuePlayerIds(container)).toEqual(['p1', 'p2', 'p0', 'p3']);
    const initialPosition = container
      .querySelector('[data-player-id="p2"]')
      ?.getAttribute('style');
    const nextActor = initialPlayers.map((player) => ({
      ...player,
      isCurrentActor: player.playerId === 'p2',
    }));

    rerender(
      <TableSeats
        actionRoundKey="hand-1:flop"
        players={nextActor}
        ownPlayerId="p0"
      />,
    );

    expect(mobileQueuePlayerIds(container)).toEqual(['p1', 'p2', 'p0', 'p3']);
    expect(
      container.querySelector('[data-player-id="p2"]')?.getAttribute('style'),
    ).toBe(initialPosition);
  });

  it('keeps exactly one hidden own-player summary in the mobile queue', () => {
    const players = makePlayers(4).map((player) => ({
      ...player,
      isCurrentActor: player.playerId === 'p1',
    }));
    const { container, rerender } = render(
      <TableSeats players={players} ownPlayerId="p0" />,
    );

    const summaries = container.querySelectorAll(
      '.table-seat--mobile-own-summary',
    );
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toHaveAttribute('aria-hidden', 'true');
    expect(summaries[0]?.querySelector('button')).toBeNull();
    expect(
      within(summaries[0] as HTMLElement).getByText('小盲'),
    ).toBeInTheDocument();
    expect(
      within(summaries[0] as HTMLElement).getByLabelText('本局下注 0'),
    ).toBeInTheDocument();
    expect(
      within(summaries[0] as HTMLElement).getByLabelText('本轮下注 0'),
    ).toBeInTheDocument();
    expect(mobileQueuePlayerIds(container)).toHaveLength(4);
    expect(screen.getAllByRole('listitem')).toHaveLength(4);

    rerender(
      <TableSeats
        players={players.map((player) => ({
          ...player,
          isCurrentActor: player.playerId === 'p0',
        }))}
        ownPlayerId="p0"
      />,
    );
    expect(mobileQueuePlayerIds(container)).toHaveLength(4);
    expect(
      container.querySelectorAll('.table-seat--mobile-own-summary'),
    ).toHaveLength(1);
  });

  it('reorders a new action round even when the actor stays the same', () => {
    const initialPlayers = makePlayers(4).map((player, index) => ({
      ...player,
      actionOrder: [3, 1, 2, null][index],
      isCurrentActor: player.playerId === 'p1',
    }));
    const { container, rerender } = render(
      <TableSeats
        actionRoundKey="hand-1:flop"
        players={initialPlayers}
        ownPlayerId="p0"
      />,
    );
    const seats = screen.getByRole('list', { name: '4 人座位布局' });
    const scrollTo = vi.fn();
    Object.defineProperty(seats, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });

    rerender(
      <TableSeats
        actionRoundKey="hand-1:turn"
        players={initialPlayers.map((player, index) => ({
          ...player,
          actionOrder: [2, 3, 1, null][index],
        }))}
        ownPlayerId="p0"
      />,
    );

    expect(mobileQueuePlayerIds(container)).toEqual(['p2', 'p0', 'p1', 'p3']);
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      name: 'left aligns while remaining cards overflow',
      clientWidth: 120,
      scrollWidth: 360,
      actorOffset: 160,
      expectedLeft: 160,
    },
    {
      name: 'uses the natural maximum when remaining cards fit',
      clientWidth: 200,
      scrollWidth: 300,
      actorOffset: 180,
      expectedLeft: 100,
    },
    {
      name: 'does not scroll when the full queue fits',
      clientWidth: 320,
      scrollWidth: 300,
      actorOffset: 180,
      expectedLeft: 0,
    },
  ])('$name', ({ clientWidth, scrollWidth, actorOffset, expectedLeft }) => {
    const players = makePlayers(4).map((player, index) => ({
      ...player,
      actionOrder: index + 1,
      isCurrentActor: player.playerId === 'p0',
    }));
    const { container, rerender } = render(
      <TableSeats
        actionRoundKey="hand-1:flop"
        players={players}
        ownPlayerId="p0"
      />,
    );
    const seats = screen.getByRole('list', { name: '4 人座位布局' });
    const actorCard = container.querySelector(
      '[data-mobile-queue-player-id="p2"]',
    )!;
    const scrollTo = vi.fn();
    setElementMetric(seats, 'clientWidth', clientWidth);
    setElementMetric(seats, 'scrollWidth', scrollWidth);
    setElementMetric(actorCard, 'offsetLeft', actorOffset);
    Object.defineProperty(seats, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });

    rerender(
      <TableSeats
        actionRoundKey="hand-1:flop"
        players={players.map((player) => ({
          ...player,
          isCurrentActor: player.playerId === 'p2',
        }))}
        ownPlayerId="p0"
      />,
    );

    expect(scrollTo).toHaveBeenLastCalledWith({
      left: expectedLeft,
      behavior: 'smooth',
    });
  });

  it('keeps a permanently removed player on their seat as exited', () => {
    const { container } = render(
      <TableSeats
        players={[
          makePlayers(2)[0]!,
          { ...makePlayers(2)[1]!, status: 'removed' },
        ]}
        ownPlayerId="p0"
      />,
    );

    expect(container.querySelector('.table-seat--removed')).toHaveTextContent(
      '已退出',
    );
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
  });

  it('labels a completed action on the corresponding player seat', () => {
    render(
      <TableSeats
        ownPlayerId="p0"
        players={[
          { ...makePlayers(2)[0]!, lastAction: 'check' },
          makePlayers(2)[1]!,
        ]}
      />,
    );
    expect(screen.getAllByText('过牌')).toHaveLength(2);
  });

  it('shows every player’s hand and current-street bets on the table', () => {
    render(
      <TableSeats
        ownPlayerId="p0"
        players={[
          {
            ...makePlayers(2)[0]!,
            streetCommitted: 20,
            totalCommitted: 80,
          },
          {
            ...makePlayers(2)[1]!,
            streetCommitted: 60,
            totalCommitted: 140,
          },
        ]}
      />,
    );
    expect(screen.getAllByLabelText('本轮下注 20')).toHaveLength(2);
    expect(screen.getByLabelText('本轮下注 60')).toBeInTheDocument();
    expect(screen.getAllByLabelText('本局下注 80')).toHaveLength(2);
    expect(screen.getByLabelText('本局下注 140')).toBeInTheDocument();

    const handContribution = screen.getAllByLabelText('本局下注 80')[0]!;
    const streetContribution = screen.getAllByLabelText('本轮下注 20')[0]!;
    expect(handContribution.parentElement).toHaveClass('table-seat__bets');
    expect(streetContribution.parentElement).toBe(
      handContribution.parentElement,
    );
    expect(handContribution.parentElement?.children).toHaveLength(2);
    expect(handContribution).toHaveClass('table-seat__hand-bet');
    expect(streetContribution).toHaveClass('table-seat__street-bet');
  });

  it('labels each seat with its server-provided action order', () => {
    render(
      <TableSeats
        ownPlayerId="p0"
        players={[
          { ...makePlayers(2)[0]!, actionOrder: 2 },
          { ...makePlayers(2)[1]!, actionOrder: 1 },
        ]}
      />,
    );
    expect(screen.getByText('行动顺位 1')).toBeInTheDocument();
    expect(screen.getAllByText('行动顺位 2')).toHaveLength(2);
  });

  it('renders one combined mobile action label for the current actor', () => {
    const { container } = render(
      <TableSeats
        ownPlayerId="p0"
        players={[
          { ...makePlayers(2)[0]!, isCurrentActor: false, actionOrder: 2 },
          { ...makePlayers(2)[1]!, isCurrentActor: true, actionOrder: 1 },
        ]}
      />,
    );

    const actingSeat = container.querySelector('[data-player-id="p1"]');
    expect(
      actingSeat?.querySelectorAll('.table-seat__mobile-acting-order'),
    ).toHaveLength(1);
    expect(
      actingSeat?.querySelector('.table-seat__mobile-acting-order'),
    ).toHaveTextContent('行动中 · 顺位 1');
    expect(
      actingSeat?.querySelector('.table-seat__action-order--mobile'),
    ).toHaveTextContent('顺位 1');
  });

  it('shows settlement results without displaying hole cards on player seats', () => {
    render(
      <TableSeats
        ownPlayerId="p0"
        players={[
          {
            ...makePlayers(2)[0]!,
            settlement: { netChange: 140, handType: '一对' },
          },
          {
            ...makePlayers(2)[1]!,
            settlement: { netChange: -140 },
          },
        ]}
      />,
    );
    expect(screen.queryByLabelText('玩家 1 的底牌')).toBeNull();
    expect(screen.queryByLabelText('玩家 2 的底牌')).toBeNull();
    expect(screen.getAllByText('一对')).toHaveLength(2);
    expect(screen.getAllByText('+140')).toHaveLength(2);
    expect(screen.getByText('-140')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '摊牌' })).toBeNull();
  });
});
