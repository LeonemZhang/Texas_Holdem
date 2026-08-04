import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

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
    expect(screen.getByText('小盲')).toBeInTheDocument();
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

  it('puts an opponent actor first in the mobile visual queue without moving desktop seats', () => {
    const initialPlayers = makePlayers(4);
    const { container, rerender } = render(
      <TableSeats players={initialPlayers} ownPlayerId="p0" />,
    );
    const initialPosition = container
      .querySelector('[data-player-id="p2"]')
      ?.getAttribute('style');
    const seats = screen.getByRole('list', { name: '4 人座位布局' });
    seats.scrollLeft = 120;
    const opponentActing = initialPlayers.map((player) => ({
      ...player,
      isCurrentActor: player.playerId === 'p3',
    }));

    rerender(<TableSeats players={opponentActing} ownPlayerId="p0" />);

    expect(seats.firstElementChild).toHaveAttribute('data-player-id', 'p3');
    expect(seats.scrollLeft).toBe(0);
    expect(
      container.querySelector('[data-player-id="p2"]')?.getAttribute('style'),
    ).toBe(initialPosition);
  });

  it('adds exactly one hidden, non-interactive own-player acting summary', () => {
    const { container } = render(
      <TableSeats players={makePlayers(4)} ownPlayerId="p0" />,
    );

    const summaries = container.querySelectorAll(
      '.table-seat--mobile-acting-summary',
    );
    expect(summaries).toHaveLength(1);
    expect(summaries[0]).toHaveAttribute('aria-hidden', 'true');
    expect(summaries[0]?.querySelector('button')).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
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
    expect(screen.getByText('过牌')).toBeInTheDocument();
  });

  it('shows every player’s current-street bet on the table', () => {
    render(
      <TableSeats
        ownPlayerId="p0"
        players={[
          { ...makePlayers(2)[0]!, streetCommitted: 20 },
          { ...makePlayers(2)[1]!, streetCommitted: 60 },
        ]}
      />,
    );
    expect(screen.getByText('本轮下注 20')).toBeInTheDocument();
    expect(screen.getByText('本轮下注 60')).toBeInTheDocument();
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
    expect(screen.getByText('行动顺位 2')).toBeInTheDocument();
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
    expect(screen.getByText('一对')).toBeInTheDocument();
    expect(screen.getByText('+140')).toBeInTheDocument();
    expect(screen.getByText('-140')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '摊牌' })).toBeNull();
  });
});
