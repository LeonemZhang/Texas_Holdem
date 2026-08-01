import { performance } from 'node:perf_hooks';

import {
  legalBettingActions,
  type BettingAction,
  type BettingRoundState,
} from '@texas-holdem/poker-core';

export interface Clock {
  nowMs(): number;
}

export class SystemClock implements Clock {
  nowMs(): number {
    return Math.floor(performance.timeOrigin + performance.now());
  }
}

interface DeadlineTask {
  readonly id: string;
  readonly deadlineMs: number;
  readonly order: number;
  readonly onTimeout: (nowMs: number) => void;
}

interface ActionTimeoutInput {
  readonly roomId: string;
  readonly handId: string;
  readonly turnId: string;
  readonly deadlineMs: number;
  readonly onTimeout: (nowMs: number) => void;
}

interface HandReadyTimeoutInput {
  readonly roomId: string;
  readonly afterHandId: string;
  readonly deadlineMs: number;
  readonly onTimeout: (nowMs: number) => void;
}

function assertDeadline(deadlineMs: number): void {
  if (!Number.isSafeInteger(deadlineMs) || deadlineMs < 0) {
    throw new RangeError('Deadline must be a non-negative safe integer');
  }
}

export function timedOutBettingAction(
  betting: BettingRoundState,
  playerId: string,
): BettingAction {
  const legal = legalBettingActions(betting, playerId);
  if (!legal.canFold) {
    throw new RangeError(`Player has no timed-out action: ${playerId}`);
  }
  return legal.canCheck ? { type: 'check' } : { type: 'fold' };
}

export class DeadlineScheduler {
  readonly #pending = new Map<string, DeadlineTask>();
  readonly #completed = new Set<string>();
  #nextOrder = 0;

  constructor(private readonly clock: Clock) {}

  scheduleActionTimeout(input: ActionTimeoutInput): boolean {
    return this.schedule(
      `action:${input.roomId}:${input.handId}:${input.turnId}`,
      input.deadlineMs,
      input.onTimeout,
    );
  }

  scheduleHandReadyTimeout(input: HandReadyTimeoutInput): boolean {
    return this.schedule(
      `hand-ready:${input.roomId}:${input.afterHandId}`,
      input.deadlineMs,
      input.onTimeout,
    );
  }

  cancel(taskId: string): boolean {
    return this.#pending.delete(taskId);
  }

  runDue(): number {
    const nowMs = this.clock.nowMs();
    assertDeadline(nowMs);
    const due = [...this.#pending.values()]
      .filter(({ deadlineMs }) => deadlineMs <= nowMs)
      .sort(
        (left, right) =>
          left.deadlineMs - right.deadlineMs || left.order - right.order,
      );
    for (const task of due) {
      this.#pending.delete(task.id);
      this.#completed.add(task.id);
      task.onTimeout(nowMs);
    }
    return due.length;
  }

  private schedule(
    id: string,
    deadlineMs: number,
    onTimeout: (nowMs: number) => void,
  ): boolean {
    assertDeadline(deadlineMs);
    if (!id.trim()) throw new RangeError('Deadline id cannot be empty');
    if (this.#pending.has(id) || this.#completed.has(id)) return false;
    this.#pending.set(id, {
      id,
      deadlineMs,
      order: this.#nextOrder,
      onTimeout,
    });
    this.#nextOrder += 1;
    return true;
  }
}
