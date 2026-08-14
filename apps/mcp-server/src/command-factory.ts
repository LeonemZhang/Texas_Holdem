import type { LegalActions } from '@texas-holdem/protocol';

export type BettingAction = 'fold' | 'check' | 'call' | 'raise' | 'all-in';

export interface CommandBase {
  protocolVersion: '3';
  commandId: string;
  roomId: string;
  playerId: string;
  expectedVersion: number;
}

export function buildBettingCommand(
  base: CommandBase,
  action: BettingAction,
  legal: LegalActions,
  amount?: number,
): Record<string, unknown> {
  switch (action) {
    case 'fold':
      if (!legal.canFold) throw new Error('Fold not allowed');
      return { ...base, type: 'game.fold' };

    case 'check':
      if (!legal.canCheck) throw new Error('Check not allowed');
      return { ...base, type: 'game.check' };

    case 'call': {
      if (legal.callAmount === null) throw new Error('Call not allowed');
      return { ...base, type: 'game.call' };
    }

    case 'raise': {
      if (amount === undefined) throw new Error('Raise requires an amount');
      if (legal.minimumRaiseTo === null) throw new Error('Raise not allowed');
      if (amount < legal.minimumRaiseTo)
        throw new Error(
          `Raise amount ${amount} below minimum ${legal.minimumRaiseTo}`,
        );
      if (legal.maximumRaiseTo !== null && amount > legal.maximumRaiseTo) {
        throw new Error(
          `Raise amount ${amount} above maximum ${legal.maximumRaiseTo}`,
        );
      }
      return { ...base, type: 'game.raise-to', amount };
    }

    case 'all-in':
      if (!legal.canAllIn) throw new Error('All-in not allowed');
      return { ...base, type: 'game.all-in' };

    default: {
      const exhaustive: never = action;
      throw new Error(`Unsupported action: ${String(exhaustive)}`);
    }
  }
}

export function buildHandReadyCommand(
  base: CommandBase,
  choice: 'ready' | 'sitting-out',
): Record<string, unknown> {
  return { ...base, type: 'hand-ready.set-choice', choice };
}

export function buildShowHoleCardsCommand(
  base: CommandBase,
): Record<string, unknown> {
  return { ...base, type: 'game.show-hole-cards' };
}
