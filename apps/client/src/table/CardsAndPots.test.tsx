import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CardsAndPots } from './CardsAndPots.js';

describe('CardsAndPots', () => {
  it('fills unrevealed community cards with backs', () => {
    render(
      <CardsAndPots
        communityCards={['2c', 'Td', 'Jh']}
        totalPot={120}
        streetPots={[{ street: 'flop', amount: 120 }]}
      />,
    );
    expect(screen.getByLabelText('第 2 张公共牌 10♦')).toBeInTheDocument();
    expect(screen.getByLabelText('第 4 张公共牌，未公开')).toBeInTheDocument();
    expect(screen.getByLabelText('第 5 张公共牌，未公开')).toBeInTheDocument();
  });

  it('shows total pot and started streets without exposing pot tiers', () => {
    render(
      <CardsAndPots
        communityCards={[]}
        totalPot={460}
        currentStreet="flop"
        streetPots={[
          { street: 'preflop', amount: 300 },
          { street: 'flop', amount: 160 },
        ]}
      />,
    );
    expect(screen.getByLabelText('本手底池')).toHaveTextContent('总池460');
    expect(screen.getByLabelText('本手底池')).toHaveTextContent('翻牌前300');
    expect(screen.getByLabelText('本手底池')).toHaveTextContent('翻牌160');
    expect(screen.queryByText('主池')).not.toBeInTheDocument();
    expect(screen.queryByText('边池 1')).not.toBeInTheDocument();
    expect(screen.queryByText('待匹配')).not.toBeInTheDocument();
    expect(screen.getAllByLabelText(/未公开/)).toHaveLength(7);
  });

  it('keeps own hole cards visible in the table center before showdown', () => {
    render(
      <CardsAndPots
        communityCards={['2c', 'Td', 'Jh', 'Qs', 'Ac']}
        totalPot={120}
        streetPots={[{ street: 'river', amount: 120 }]}
        ownHoleCards={['Ah', 'Ks']}
        ownHandType="顺子"
      />,
    );
    expect(screen.getByLabelText('公共牌牌面')).toBeInTheDocument();
    expect(screen.getByLabelText('本手底池')).toBeInTheDocument();
    const ownHand = screen.getByLabelText('我的底牌');
    expect(ownHand).toBeInTheDocument();
    expect(screen.getByLabelText('当前最大牌型：顺子')).toHaveTextContent(
      '顺子',
    );
    expect(ownHand.querySelector('.hole-cards__hand-type')).toHaveTextContent(
      '顺子',
    );
    expect(ownHand.querySelector('.hole-cards__cards')).not.toBeNull();
    expect(
      ownHand
        .querySelector('.hole-cards__cards')
        ?.querySelectorAll('.playing-card'),
    ).toHaveLength(2);
    expect(screen.getByLabelText('我的第一张底牌 A♥')).toBeInTheDocument();
  });

  it('replaces the central hand with service-authorized showdown hands', () => {
    render(
      <CardsAndPots
        communityCards={[]}
        totalPot={0}
        streetPots={[]}
        ownHoleCards={['Ah', 'Ks']}
        showdownHands={[
          { playerId: 'alice', nickname: 'Alice', cards: ['Ah', 'Ks'] },
        ]}
      />,
    );
    expect(screen.getByLabelText('摊牌玩家手牌')).toBeInTheDocument();
    expect(screen.getByLabelText('Alice 的第 1 张底牌 A♥')).toBeInTheDocument();
    expect(screen.queryByLabelText('我的底牌')).not.toBeInTheDocument();
  });
});
