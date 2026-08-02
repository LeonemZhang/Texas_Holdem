import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CardsAndPots } from './CardsAndPots.js';

describe('CardsAndPots', () => {
  it('shows own cards and fills unrevealed community cards with backs', () => {
    render(
      <CardsAndPots
        ownHoleCards={['Ah', 'Ks']}
        communityCards={['2c', 'Td', 'Jh']}
        pots={[{ amount: 120, eligiblePlayerIds: ['a', 'b'] }]}
      />,
    );
    expect(screen.getByLabelText('第一张底牌 A♥')).toBeInTheDocument();
    expect(screen.getByLabelText('第二张底牌 K♠')).toBeInTheDocument();
    expect(screen.getByLabelText('第 2 张公共牌 10♦')).toBeInTheDocument();
    expect(screen.getByLabelText('第 4 张公共牌，未公开')).toBeInTheDocument();
    expect(screen.getByLabelText('第 5 张公共牌，未公开')).toBeInTheDocument();
  });

  it('keeps each server-provided side pot identifiable without deriving a winner', () => {
    render(
      <CardsAndPots
        ownHoleCards={null}
        communityCards={[]}
        pots={[
          { amount: 300, eligiblePlayerIds: ['a', 'b', 'c'] },
          { amount: 160, eligiblePlayerIds: ['a', 'b'] },
          { amount: 40, eligiblePlayerIds: ['a'] },
        ]}
      />,
    );
    expect(screen.getByText('主池')).toBeInTheDocument();
    expect(screen.getByText('边池 1')).toBeInTheDocument();
    expect(screen.getByText('待匹配')).toBeInTheDocument();
    expect(screen.queryByText(/赢家/)).not.toBeInTheDocument();
    expect(screen.getAllByLabelText(/未公开/)).toHaveLength(7);
  });
});
