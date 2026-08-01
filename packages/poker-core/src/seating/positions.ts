import { nextEligibleSeat, type Seat } from './seats.js';

export interface TablePositions {
  readonly button: Seat;
  readonly smallBlind: Seat;
  readonly bigBlind: Seat;
}

function freezePositions(
  button: Seat,
  smallBlind: Seat,
  bigBlind: Seat,
): TablePositions {
  return Object.freeze({ button, smallBlind, bigBlind });
}

export function assignHeadsUpPositions(
  seats: readonly Seat[],
  previousButtonIndex: number | null,
): TablePositions {
  const active = seats.filter(({ status }) => status === 'active');
  if (active.length !== 2) {
    throw new RangeError(
      `Heads-up requires 2 active seats, received ${active.length}`,
    );
  }

  const button =
    previousButtonIndex === null
      ? [...active].sort((a, b) => a.index - b.index)[0]!
      : nextEligibleSeat(seats, previousButtonIndex)!;
  const bigBlind = nextEligibleSeat(seats, button.index)!;
  return freezePositions(button, button, bigBlind);
}

export type BettingStreet = 'preflop' | 'flop' | 'turn' | 'river';

export function headsUpActionOrderForStreet(
  positions: TablePositions,
  street: BettingStreet,
): readonly Seat[] {
  return Object.freeze(
    street === 'preflop'
      ? [positions.button, positions.bigBlind]
      : [positions.bigBlind, positions.button],
  );
}
