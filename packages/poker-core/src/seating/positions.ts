import {
  eligibleSeatsClockwise,
  nextEligibleSeat,
  type Seat,
} from './seats.js';

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

export function assignTablePositions(
  seats: readonly Seat[],
  previousButtonIndex: number | null,
): TablePositions {
  const activeCount = seats.filter(({ status }) => status === 'active').length;
  if (activeCount < 2 || activeCount > 10) {
    throw new RangeError(
      `A table requires 2 to 10 active seats, received ${activeCount}`,
    );
  }
  if (activeCount === 2) {
    return assignHeadsUpPositions(seats, previousButtonIndex);
  }

  const button =
    previousButtonIndex === null
      ? eligibleSeatsClockwise(seats, 9)[0]!
      : nextEligibleSeat(seats, previousButtonIndex)!;
  const smallBlind = nextEligibleSeat(seats, button.index)!;
  const bigBlind = nextEligibleSeat(seats, smallBlind.index)!;
  return freezePositions(button, smallBlind, bigBlind);
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

export function actionOrderForStreet(
  seats: readonly Seat[],
  positions: TablePositions,
  street: BettingStreet,
): readonly Seat[] {
  const afterIndex =
    street === 'preflop' ? positions.bigBlind.index : positions.button.index;
  return eligibleSeatsClockwise(seats, afterIndex);
}
