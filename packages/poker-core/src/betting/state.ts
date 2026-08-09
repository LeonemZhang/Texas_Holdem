export type BettingPlayerStatus = 'active' | 'folded' | 'all-in';

export interface BettingPlayer {
  readonly playerId: string;
  readonly stack: number;
  readonly streetCommitted: number;
  readonly totalCommitted: number;
  readonly status: BettingPlayerStatus;
  readonly actedAtBet: number | null;
}

export function isContender(player: Pick<BettingPlayer, 'status'>): boolean {
  return player.status === 'active' || player.status === 'all-in';
}

export interface BettingRoundState {
  readonly players: readonly BettingPlayer[];
  readonly currentBet: number;
  readonly minimumRaiseIncrement: number;
  readonly currentActorId: string | null;
  readonly pendingPlayerIds: readonly string[];
}

export function assertChipAmount(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer`);
  }
}

export function freezeBettingState(
  state: BettingRoundState,
): BettingRoundState {
  return Object.freeze({
    ...state,
    players: Object.freeze(
      state.players.map((player) => Object.freeze({ ...player })),
    ),
    pendingPlayerIds: Object.freeze([...state.pendingPlayerIds]),
  });
}

export function createBettingRound(
  players: readonly Omit<BettingPlayer, 'actedAtBet'>[],
  minimumRaiseIncrement: number,
  currentActorId?: string,
): BettingRoundState {
  if (players.length < 2) {
    throw new RangeError('A betting round requires at least two players');
  }
  assertChipAmount(minimumRaiseIncrement, 'Minimum raise increment');
  if (minimumRaiseIncrement === 0) {
    throw new RangeError('Minimum raise increment must be greater than zero');
  }

  const ids = new Set<string>();
  for (const player of players) {
    if (!player.playerId || ids.has(player.playerId)) {
      throw new RangeError(`Duplicate or empty player id: ${player.playerId}`);
    }
    ids.add(player.playerId);
    assertChipAmount(player.stack, 'Stack');
    assertChipAmount(player.streetCommitted, 'Street commitment');
    assertChipAmount(player.totalCommitted, 'Total commitment');
    if (player.totalCommitted < player.streetCommitted) {
      throw new RangeError(
        'Total commitment cannot be below street commitment',
      );
    }
  }

  const normalized = players.map((player) => ({ ...player, actedAtBet: null }));
  const actionable = normalized.filter(({ status }) => status === 'active');
  const actorId = currentActorId ?? actionable[0]?.playerId ?? null;
  if (
    actorId !== null &&
    !actionable.some(({ playerId }) => playerId === actorId)
  ) {
    throw new RangeError(`Current actor is not active: ${actorId}`);
  }
  const actorIndex = actionable.findIndex(
    ({ playerId }) => playerId === actorId,
  );
  const pending =
    actorIndex < 0
      ? []
      : [
          ...actionable.slice(actorIndex),
          ...actionable.slice(0, actorIndex),
        ].map(({ playerId }) => playerId);

  return freezeBettingState({
    players: normalized,
    currentBet: Math.max(
      ...normalized.map(({ streetCommitted }) => streetCommitted),
    ),
    minimumRaiseIncrement,
    currentActorId: actorId,
    pendingPlayerIds: pending,
  });
}

export function requireCurrentActor(
  state: BettingRoundState,
  playerId: string,
): BettingPlayer {
  if (state.currentActorId !== playerId) {
    throw new RangeError(`It is not ${playerId}'s turn`);
  }
  const player = state.players.find(
    (candidate) => candidate.playerId === playerId,
  );
  if (!player || player.status !== 'active') {
    throw new RangeError(`Player is not active: ${playerId}`);
  }
  return player;
}

export function pendingClockwiseAfter(
  players: readonly BettingPlayer[],
  pending: ReadonlySet<string>,
  afterPlayerId: string,
): readonly string[] {
  const start = players.findIndex(({ playerId }) => playerId === afterPlayerId);
  return [...players.slice(start + 1), ...players.slice(0, start + 1)]
    .filter(
      ({ playerId, status }) => status === 'active' && pending.has(playerId),
    )
    .map(({ playerId }) => playerId);
}
