import { describe, it, expect } from 'vitest';
import {
  buildBettingCommand,
  buildHandReadyCommand,
  buildShowHoleCardsCommand,
} from '../command-factory.js';

const base = {
  protocolVersion: '3' as const,
  commandId: 'cmd-1',
  roomId: 'room-1',
  playerId: 'player-1',
  expectedVersion: 5,
};

function fullLegal() {
  return {
    canFold: true,
    canCheck: true,
    callAmount: 20,
    minimumRaiseTo: 40,
    maximumRaiseTo: 200,
    canAllIn: true,
  };
}

describe('buildBettingCommand', () => {
  it('builds fold command', () => {
    const cmd = buildBettingCommand(base, 'fold', fullLegal());
    expect(cmd.type).toBe('game.fold');
  });

  it('throws when fold is not allowed', () => {
    const legal = { ...fullLegal(), canFold: false };
    expect(() => buildBettingCommand(base, 'fold', legal)).toThrow(
      'Fold not allowed',
    );
  });

  it('builds check command', () => {
    const cmd = buildBettingCommand(base, 'check', fullLegal());
    expect(cmd.type).toBe('game.check');
  });

  it('builds call command', () => {
    const cmd = buildBettingCommand(base, 'call', fullLegal());
    expect(cmd.type).toBe('game.call');
  });

  it('throws when call is not allowed', () => {
    const legal = { ...fullLegal(), callAmount: null };
    expect(() => buildBettingCommand(base, 'call', legal)).toThrow(
      'Call not allowed',
    );
  });

  it('builds raise command with amount', () => {
    const cmd = buildBettingCommand(base, 'raise', fullLegal(), 80);
    expect(cmd.type).toBe('game.raise-to');
    expect(cmd.amount).toBe(80);
  });

  it('throws when raise amount is below minimum', () => {
    expect(() => buildBettingCommand(base, 'raise', fullLegal(), 30)).toThrow(
      'below minimum',
    );
  });

  it('throws when raise amount is above maximum', () => {
    expect(() => buildBettingCommand(base, 'raise', fullLegal(), 300)).toThrow(
      'above maximum',
    );
  });

  it('throws when raise without amount', () => {
    expect(() => buildBettingCommand(base, 'raise', fullLegal())).toThrow(
      'Raise requires an amount',
    );
  });

  it('builds all-in command', () => {
    const cmd = buildBettingCommand(base, 'all-in', fullLegal());
    expect(cmd.type).toBe('game.all-in');
  });

  it('throws when all-in is not allowed', () => {
    const legal = { ...fullLegal(), canAllIn: false };
    expect(() => buildBettingCommand(base, 'all-in', legal)).toThrow(
      'All-in not allowed',
    );
  });

  it('accepts raise-to at exact minimumRaiseTo', () => {
    const cmd = buildBettingCommand(base, 'raise', fullLegal(), 40);
    expect(cmd.amount).toBe(40);
  });

  it('accepts raise-to at exact maximumRaiseTo', () => {
    const cmd = buildBettingCommand(base, 'raise', fullLegal(), 200);
    expect(cmd.amount).toBe(200);
  });

  it('allows raise when maximumRaiseTo is null (unlimited)', () => {
    const legal = { ...fullLegal(), maximumRaiseTo: null };
    const cmd = buildBettingCommand(base, 'raise', legal, 500);
    expect(cmd.amount).toBe(500);
  });
});

describe('buildHandReadyCommand', () => {
  it('builds ready command', () => {
    const cmd = buildHandReadyCommand(base, 'ready');
    expect(cmd.type).toBe('hand-ready.set-choice');
    expect(cmd.choice).toBe('ready');
  });

  it('builds sitting-out command', () => {
    const cmd = buildHandReadyCommand(base, 'sitting-out');
    expect(cmd.choice).toBe('sitting-out');
  });
});

describe('buildShowHoleCardsCommand', () => {
  it('builds show-hole-cards command', () => {
    const cmd = buildShowHoleCardsCommand(base);
    expect(cmd.type).toBe('game.show-hole-cards');
  });
});
