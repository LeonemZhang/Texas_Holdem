import { describe, expect, it, vi } from 'vitest';

import { ConnectionStateMachine } from './connection.js';

describe('ConnectionStateMachine', () => {
  it('distinguishes connection, recovery, failure and deliberate disconnect states', () => {
    const machine = new ConnectionStateMachine();
    expect(machine.state.status).toBe('disconnected');
    expect(machine.dispatch({ type: 'connect-requested' }).status).toBe(
      'connecting',
    );
    expect(machine.dispatch({ type: 'connected' }).status).toBe('connected');
    expect(
      machine.dispatch({ type: 'connection-lost', reason: 'transport close' }),
    ).toEqual({ status: 'recovering', reason: 'transport close' });
    expect(machine.dispatch({ type: 'recovery-succeeded' }).status).toBe(
      'connected',
    );
    expect(machine.dispatch({ type: 'failed', error: 'timeout' })).toEqual({
      status: 'failed',
      error: 'timeout',
    });
    expect(machine.dispatch({ type: 'disconnected' }).status).toBe(
      'disconnected',
    );
  });

  it('publishes current and subsequent immutable states to subscribers', () => {
    const machine = new ConnectionStateMachine();
    const listener = vi.fn();
    const unsubscribe = machine.subscribe(listener);
    machine.dispatch({ type: 'connect-requested' });
    unsubscribe();
    machine.dispatch({ type: 'connected' });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls.map(([state]) => state.status)).toEqual([
      'disconnected',
      'connecting',
    ]);
    expect(Object.isFrozen(machine.state)).toBe(true);
  });
});
