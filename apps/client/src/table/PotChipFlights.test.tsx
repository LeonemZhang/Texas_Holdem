import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  PotChipFlights,
  chipSizeForAmount,
  chipTextLengthForAmount,
} from './PotChipFlights.js';

describe('chipSizeForAmount', () => {
  it('keeps the one-digit flight chip as the minimum diameter', () => {
    expect(chipSizeForAmount(9)).toBe('2.35rem');
  });

  it('grows monotonically from one to five numeric digits without linear digit multiplication', () => {
    const sizes = [9, 99, 999, 9_999, 99_999].map((amount) =>
      Number.parseFloat(chipSizeForAmount(amount)),
    );

    expect(sizes).toEqual([2.35, 2.99, 3.53, 4.05, 4.51]);
    expect(sizes).not.toEqual([2.35, 4.7, 7.05, 9.4, 11.75]);
    expect(sizes).toEqual([...sizes].sort((a, b) => a - b));
  });

  it('budgets for the displayed localized text length', () => {
    expect(chipTextLengthForAmount(999)).toBe(3);
    expect(chipTextLengthForAmount(1_000)).toBe(5);
    expect(chipSizeForAmount(1_000)).toBe(chipSizeForAmount(9_999));
  });

  it('keeps the circular layers and text width variable together', () => {
    render(
      <div className="poker-table">
        <div data-player-id="bob" />
        <div data-pot-target />
        <PotChipFlights
          flights={[{ id: 'flight-4', playerId: 'bob', amount: 9_999 }]}
          onFlightEnd={vi.fn()}
        />
      </div>,
    );

    const value = screen.getByText('9,999');
    const chip = value.closest('.pot-chip-flight__chip');
    const flight = value.closest('.pot-chip-flight');
    expect(chip).toHaveAttribute('data-pot-chip-digits', '4');
    expect(chip).not.toHaveAttribute('data-pot-chip-scale');
    expect(chip).not.toHaveAttribute('data-pot-chip-large');
    expect(flight).toHaveStyle({
      '--pot-chip-resolved-size': '4.05rem',
      '--pot-chip-text-chars': '5',
    });
    expect(chip?.querySelector('.poker-chip__disc')).toContainElement(value);
  });
});
