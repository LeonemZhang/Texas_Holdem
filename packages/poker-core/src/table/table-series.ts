import type { RandomSource } from '../cards/shuffle.js';
import { startHand, type StartedHandState } from '../hand/start-hand.js';
import type { ShowdownSettledHand } from '../hand/showdown.js';
import type { UncontestedSettledHand } from '../hand/uncontested.js';
import type { SeatStatus } from '../seating/seats.js';

export interface TablePlayerState {
  readonly playerId: string;
  readonly seatIndex: number;
  readonly stack: number;
  readonly status: SeatStatus;
}

export interface TableSeriesState {
  readonly tableId: string;
  readonly players: readonly TablePlayerState[];
  readonly completedHands: number;
  readonly lastButtonIndex: number | null;
  readonly lastCompletedHandId: string | null;
}

export function createTableSeries(
  tableId: string,
  players: readonly TablePlayerState[],
): TableSeriesState {
  if (!tableId) throw new RangeError('Table id cannot be empty');
  return Object.freeze({
    tableId,
    players: Object.freeze(
      players.map((player) => Object.freeze({ ...player })),
    ),
    completedHands: 0,
    lastButtonIndex: null,
    lastCompletedHandId: null,
  });
}

export function startNextTableHand(
  table: TableSeriesState,
  handId: string,
  smallBlind: number,
  randomSource: RandomSource,
): StartedHandState {
  const participants = table.players
    .filter(({ status, stack }) => status === 'active' && stack > 0)
    .map(({ playerId, seatIndex, stack }) => ({ playerId, seatIndex, stack }));
  return startHand({
    handId,
    participants,
    previousButtonIndex: table.lastButtonIndex,
    smallBlind,
    randomSource,
  });
}

export function recordCompletedHand(
  table: TableSeriesState,
  hand: UncontestedSettledHand | ShowdownSettledHand,
): TableSeriesState {
  if (table.lastCompletedHandId === hand.handId) {
    throw new RangeError(`Hand was already recorded: ${hand.handId}`);
  }
  const finalStacks = new Map(
    hand.players.map(({ playerId, stack }) => [playerId, stack]),
  );
  return Object.freeze({
    ...table,
    players: Object.freeze(
      table.players.map((player) =>
        Object.freeze({
          ...player,
          stack: finalStacks.get(player.playerId) ?? player.stack,
        }),
      ),
    ),
    completedHands: table.completedHands + 1,
    lastButtonIndex: hand.positions.button.index,
    lastCompletedHandId: hand.handId,
  });
}
