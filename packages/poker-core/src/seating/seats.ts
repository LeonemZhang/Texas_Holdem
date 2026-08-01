export const MAX_SEATS = 10;

export type SeatStatus = 'active' | 'eliminated' | 'left' | 'sitting-out';

export interface Seat {
  readonly index: number;
  readonly playerId: string;
  readonly status: SeatStatus;
}

export function isHandEligible(seat: Seat): boolean {
  return seat.status === 'active';
}

function assertSeats(seats: readonly Seat[]): void {
  if (seats.length > MAX_SEATS) {
    throw new RangeError(`At most ${MAX_SEATS} seats are supported`);
  }

  const indexes = new Set<number>();
  const players = new Set<string>();
  for (const seat of seats) {
    if (!Number.isInteger(seat.index) || seat.index < 0 || seat.index >= 10) {
      throw new RangeError(`Invalid seat index: ${seat.index}`);
    }
    if (!seat.playerId) {
      throw new RangeError('Player id cannot be empty');
    }
    if (indexes.has(seat.index)) {
      throw new RangeError(`Duplicate seat index: ${seat.index}`);
    }
    if (players.has(seat.playerId)) {
      throw new RangeError(`Duplicate player: ${seat.playerId}`);
    }
    indexes.add(seat.index);
    players.add(seat.playerId);
  }
}

export function eligibleSeatsClockwise(
  seats: readonly Seat[],
  afterIndex: number,
): readonly Seat[] {
  assertSeats(seats);
  if (!Number.isInteger(afterIndex) || afterIndex < 0 || afterIndex >= 10) {
    throw new RangeError(`Invalid starting seat index: ${afterIndex}`);
  }

  return Object.freeze(
    seats.filter(isHandEligible).sort((left, right) => {
      const leftDistance = (left.index - afterIndex + MAX_SEATS) % MAX_SEATS;
      const rightDistance = (right.index - afterIndex + MAX_SEATS) % MAX_SEATS;
      const normalizedLeft = leftDistance === 0 ? MAX_SEATS : leftDistance;
      const normalizedRight = rightDistance === 0 ? MAX_SEATS : rightDistance;
      return normalizedLeft - normalizedRight;
    }),
  );
}

export function nextEligibleSeat(
  seats: readonly Seat[],
  afterIndex: number,
): Seat | null {
  return eligibleSeatsClockwise(seats, afterIndex)[0] ?? null;
}
