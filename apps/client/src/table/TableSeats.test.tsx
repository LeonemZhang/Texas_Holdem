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

  it('shows public showdown cards only on the matching contender seat', () => {
    render(
      <TableSeats
        ownPlayerId="p0"
        players={[
          { ...makePlayers(2)[0]!, revealedHoleCards: ['Th', 'As'] },
          makePlayers(2)[1]!,
        ]}
      />,
    );
    expect(screen.getByLabelText('玩家 1 摊牌底牌 10♥ A♠')).toBeInTheDocument();
  });
});
