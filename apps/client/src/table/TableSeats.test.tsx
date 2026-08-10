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
  property:
    'clientWidth' | 'scrollWidth' | 'scrollLeft' | 'offsetLeft' | 'offsetWidth',
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

  it('lays out four desktop seats as opposing top, bottom, left and right seats', () => {
    const { container } = render(
      <TableSeats players={makePlayers(4)} ownPlayerId="p2" />,
    );
    const seatPosition = (playerId: string) => {
      const seat = container.querySelector<HTMLElement>(
        `[data-player-id="${playerId}"]`,
      );
      return {
        left: Math.round(Number.parseFloat(seat?.style.left ?? '') * 1e6) / 1e6,
        top: Math.round(Number.parseFloat(seat?.style.top ?? '') * 1e6) / 1e6,
      };
    };

    expect(seatPosition('p2')).toEqual({ left: 50, top: 86 });
    expect(seatPosition('p3')).toEqual({ left: 18, top: 50 });
    expect(seatPosition('p0')).toEqual({ left: 50, top: 10 });
    expect(seatPosition('p1')).toEqual({ left: 82, top: 50 });
  });

  it('keeps the own four-player seat centered along the bottom edge', () => {
    const { container } = render(
      <TableSeats players={makePlayers(4)} ownPlayerId="p0" />,
    );
    const ownSeat = container.querySelector<HTMLElement>(
      '[data-player-id="p0"]',
    );

    expect(ownSeat?.style.left).toBe('50%');
    expect(ownSeat?.style.top).toBe('86%');
  });

  it('places heads-up players directly opposite each other', () => {
    const { container } = render(
      <TableSeats players={makePlayers(2)} ownPlayerId="p0" />,
    );
    const seatPosition = (playerId: string) => {
      const seat = container.querySelector<HTMLElement>(
        `[data-player-id="${playerId}"]`,
      );
      return {
        left: Math.round(Number.parseFloat(seat?.style.left ?? '') * 1e6) / 1e6,
        top: Math.round(Number.parseFloat(seat?.style.top ?? '') * 1e6) / 1e6,
      };
    };

    expect(seatPosition('p0')).toEqual({ left: 50, top: 87 });
    expect(seatPosition('p1')).toEqual({ left: 50, top: 10 });
  });

  it.each([2, 3, 6, 7, 8, 9, 10])(
    'anchors the own seat at the heads-up bottom for %i players',
    (count) => {
      const { container } = render(
        <TableSeats players={makePlayers(count)} ownPlayerId="p0" />,
      );
      const ownSeat = container.querySelector<HTMLElement>('.table-seat--own');

      expect(ownSeat?.style.top).toBe('87%');
    },
  );

  it('raises the upper ring for a full ten-player table', () => {
    const { container } = render(
      <TableSeats players={makePlayers(10)} ownPlayerId="p0" />,
    );
    const seatPosition = (playerId: string) =>
      Number.parseFloat(
        container.querySelector<HTMLElement>(`[data-player-id="${playerId}"]`)
          ?.style.top ?? '',
      );

    expect(seatPosition('p5')).toBe(10);
    expect(seatPosition('p4')).toBe(12);
    expect(seatPosition('p3')).toBe(34);
    expect(seatPosition('p7')).toBe(34);
    expect(seatPosition('p0')).toBe(87);
  });

  it.each([
    [6, [87, 70, 30, 10, 30, 70]],
    [7, [87, 70, 43, 10, 10, 43, 70]],
    [8, [87, 78, 50, 24, 10, 24, 50, 78]],
    [9, [87, 73, 56, 30, 10, 10, 30, 56, 73]],
  ] as const)(
    'uses the screenshot spacing for %i players',
    (count, expectedTops) => {
      const { container } = render(
        <TableSeats players={makePlayers(count)} ownPlayerId="p0" />,
      );
      const actualTops = Array.from(
        container.querySelectorAll<HTMLElement>('[data-player-id]'),
      )
        .sort(
          (left, right) =>
            Number(left.dataset.seatPosition) -
            Number(right.dataset.seatPosition),
        )
        .map((seat) => Number.parseFloat(seat.style.top));

      expect(actualTops).toEqual(expectedTops);
    },
  );

  it('moves the marked seven-player side seats outward while raising them', () => {
    const { container } = render(
      <TableSeats players={makePlayers(7)} ownPlayerId="p0" />,
    );
    const seatPosition = (playerId: string) => {
      const seat = container.querySelector<HTMLElement>(
        `[data-player-id="${playerId}"]`,
      );
      return {
        left: Number.parseFloat(seat?.style.left ?? ''),
        top: Number.parseFloat(seat?.style.top ?? ''),
      };
    };

    expect(seatPosition('p2')).toEqual({ left: 11, top: 43 });
    expect(seatPosition('p5')).toEqual({ left: 89, top: 43 });
  });

  it('moves the marked nine-player upper side seats toward the center', () => {
    const { container } = render(
      <TableSeats players={makePlayers(9)} ownPlayerId="p0" />,
    );
    const seatPosition = (playerId: string) => {
      const seat = container.querySelector<HTMLElement>(
        `[data-player-id="${playerId}"]`,
      );
      return {
        left: Number.parseFloat(seat?.style.left ?? ''),
        top: Number.parseFloat(seat?.style.top ?? ''),
      };
    };

    expect(seatPosition('p3')).toEqual({ left: 17, top: 30 });
    expect(seatPosition('p6')).toEqual({ left: 83, top: 30 });
  });

  it.each([
    [6, [10]],
    [7, [10, 10]],
    [8, [10]],
    [9, [10, 10]],
  ] as const)(
    'keeps the upper seats clear of the center stack for %i players',
    (count, expectedTops) => {
      const { container } = render(
        <TableSeats players={makePlayers(count)} ownPlayerId="p0" />,
      );
      const topSeats = Array.from(
        container.querySelectorAll<HTMLElement>(
          '.table-seat[data-player-id]:not(.table-seat--own)',
        ),
      )
        .map((seat) => Number.parseFloat(seat.style.top))
        .filter((top) => top <= 10)
        .sort((left, right) => left - right);

      expect(topSeats).toEqual(expectedTops);
    },
  );

  it.each([5, 6, 7, 8, 9, 10])(
    'keeps %i desktop seats unique and stable when action order changes',
    (count) => {
      const initialPlayers = makePlayers(count).map((player, index) => ({
        ...player,
        actionOrder: count - index,
        isCurrentActor: index === count - 1,
      }));
      const { container, rerender } = render(
        <TableSeats players={initialPlayers} ownPlayerId="p0" />,
      );
      const seatElements = () =>
        Array.from(
          container.querySelectorAll<HTMLElement>(
            '.table-seat[data-player-id]',
          ),
        );
      const seatPosition = (playerId: string) => {
        const seat = container.querySelector<HTMLElement>(
          `[data-player-id="${playerId}"]`,
        );
        return {
          left: Number.parseFloat(seat?.style.left ?? ''),
          top: Number.parseFloat(seat?.style.top ?? ''),
        };
      };
      const initialPositions = initialPlayers.map((player) => ({
        playerId: player.playerId,
        position: seatPosition(player.playerId),
      }));

      expect(
        new Set(
          initialPositions.map(
            ({ position }) => `${position.left}:${position.top}`,
          ),
        ).size,
      ).toBe(count);
      expect(
        initialPositions.every(
          ({ position }) =>
            position.left >= 0 &&
            position.left <= 100 &&
            position.top >= 0 &&
            position.top <= 100,
        ),
      ).toBe(true);
      const expectedInitialOrder = [...initialPlayers]
        .sort((left, right) => left.actionOrder! - right.actionOrder!)
        .map((player) => player.playerId);
      expect(
        seatElements()
          .map((seat) => seat.dataset.playerId)
          .sort()
          .join(','),
      ).toBe(expectedInitialOrder.sort().join(','));

      const nextPlayers = initialPlayers.map((player, index) => ({
        ...player,
        actionOrder: index + 1,
        isCurrentActor: index === 0,
      }));
      rerender(<TableSeats players={nextPlayers} ownPlayerId="p0" />);

      expect(
        initialPositions.map(({ playerId }) => ({
          playerId,
          position: seatPosition(playerId),
        })),
      ).toEqual(initialPositions);
      expect(
        seatElements()
          .map((seat) => seat.dataset.playerId)
          .sort()
          .join(','),
      ).toBe(
        nextPlayers
          .map((player) => player.playerId)
          .sort()
          .join(','),
      );
    },
  );

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

  it('keeps dealer and small-blind labels on one row for the same player', () => {
    const { container } = render(
      <TableSeats
        ownPlayerId="p0"
        players={[
          {
            ...makePlayers(2)[0]!,
            isDealer: true,
            isSmallBlind: true,
          },
          makePlayers(2)[1]!,
        ]}
      />,
    );

    expect(
      container.querySelector(
        '.table-seat__position-labels--dealer-small-blind',
      ),
    ).toHaveTextContent('庄家小盲');
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
    const seats = container.querySelector<HTMLElement>('.table-seats__queue')!;
    const actorCard = container.querySelector(
      '[data-mobile-queue-player-id="p1"]',
    )!;
    const lastCard = container.querySelector(
      '[data-mobile-queue-player-id="p3"]',
    )!;
    const scrollTo = vi.fn();
    setElementMetric(seats, 'clientWidth', 200);
    setElementMetric(seats, 'scrollWidth', 300);
    setElementMetric(actorCard, 'offsetLeft', 180);
    setElementMetric(actorCard, 'offsetWidth', 60);
    setElementMetric(lastCard, 'offsetLeft', 240);
    setElementMetric(lastCard, 'offsetWidth', 60);
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

  it('keeps the fixed own seat outside the scrolling queue', () => {
    const { container } = render(
      <TableSeats players={makePlayers(5)} ownPlayerId="p0" />,
    );
    const ownSeat = container.querySelector('.table-seat--own');

    expect(ownSeat).toBeInTheDocument();
    expect(ownSeat?.closest('.table-seats__queue')).toBeNull();
  });

  it('keeps the first two actors at the queue start and anchors later actors at position two', () => {
    const players = makePlayers(8).map((player, index) => ({
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
    const seats = container.querySelector<HTMLElement>('.table-seats__queue')!;
    const queueCards = Array.from(
      container.querySelectorAll<HTMLElement>('[data-mobile-queue-player-id]'),
    );
    const scrollTo = vi.fn(({ left }: { readonly left: number }) => {
      setElementMetric(seats, 'scrollLeft', left);
    });
    setElementMetric(seats, 'clientWidth', 240);
    setElementMetric(seats, 'scrollWidth', 480);
    queueCards.forEach((card, index) => {
      setElementMetric(card, 'offsetLeft', index * 60);
      setElementMetric(card, 'offsetWidth', 60);
    });
    Object.defineProperty(seats, 'scrollTo', {
      configurable: true,
      value: scrollTo,
    });

    const setActor = (index: number) =>
      rerender(
        <TableSeats
          actionRoundKey="hand-1:flop"
          players={players.map((player) => ({
            ...player,
            isCurrentActor: player.playerId === `p${index}`,
          }))}
          ownPlayerId="p0"
        />,
      );

    setActor(1);
    expect(scrollTo).not.toHaveBeenCalled();

    setActor(2);
    expect(scrollTo).toHaveBeenLastCalledWith({ left: 60, behavior: 'smooth' });
    setActor(3);
    expect(scrollTo).toHaveBeenLastCalledWith({
      left: 120,
      behavior: 'smooth',
    });
    setActor(4);
    expect(scrollTo).toHaveBeenLastCalledWith({
      left: 180,
      behavior: 'smooth',
    });
    setActor(5);
    expect(scrollTo).toHaveBeenLastCalledWith({
      left: 240,
      behavior: 'smooth',
    });

    const callCountAtNaturalMaximum = scrollTo.mock.calls.length;
    setActor(6);
    setActor(7);
    expect(scrollTo).toHaveBeenCalledTimes(callCountAtNaturalMaximum);
  });

  it('does not scroll when the full queue fits', () => {
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
    const seats = container.querySelector<HTMLElement>('.table-seats__queue')!;
    const queueCards = Array.from(
      container.querySelectorAll<HTMLElement>('[data-mobile-queue-player-id]'),
    );
    const scrollTo = vi.fn();
    setElementMetric(seats, 'clientWidth', 320);
    setElementMetric(seats, 'scrollWidth', 300);
    queueCards.forEach((card, index) => {
      setElementMetric(card, 'offsetLeft', index * 60);
      setElementMetric(card, 'offsetWidth', 60);
    });
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

    expect(scrollTo).not.toHaveBeenCalled();
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

  it('shows the action label on the fixed own seat when it is the current actor', () => {
    const { container } = render(
      <TableSeats
        ownPlayerId="p0"
        players={[
          { ...makePlayers(2)[0]!, isCurrentActor: true, actionOrder: 1 },
        ]}
      />,
    );

    const ownSeat = container.querySelector('[data-player-id="p0"]');
    expect(
      ownSeat?.querySelector('.table-seat__mobile-acting-order'),
    ).toHaveTextContent('行动中 · 顺位 1');
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
