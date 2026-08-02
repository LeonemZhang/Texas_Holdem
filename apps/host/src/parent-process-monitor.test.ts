import { describe, expect, it, vi } from 'vitest';

import {
  parentPidFromEnvironment,
  startParentProcessMonitor,
} from './parent-process-monitor.js';

function scheduler() {
  let callback: (() => void) | null = null;
  return {
    timer: { id: 'parent-monitor' },
    scheduler: {
      setInterval: vi.fn((next: () => void) => {
        callback = next;
        return { id: 'parent-monitor' };
      }),
      clearInterval: vi.fn(),
    },
    tick: () => callback?.(),
  };
}

describe('parent process monitor', () => {
  it('accepts only positive integer parent process ids', () => {
    expect(parentPidFromEnvironment({ HOST_PARENT_PID: '1234' })).toBe(1234);
    expect(parentPidFromEnvironment({ HOST_PARENT_PID: '0' })).toBeNull();
    expect(parentPidFromEnvironment({ HOST_PARENT_PID: '12.5' })).toBeNull();
    expect(parentPidFromEnvironment({ HOST_PARENT_PID: 'unknown' })).toBeNull();
  });

  it('keeps the host running while its Electron parent is alive', () => {
    const timer = scheduler();
    const onParentExit = vi.fn();
    startParentProcessMonitor({
      parentPid: 1234,
      onParentExit,
      isProcessAlive: () => true,
      scheduler: timer.scheduler,
    });

    timer.tick();

    expect(onParentExit).not.toHaveBeenCalled();
    expect(timer.scheduler.clearInterval).not.toHaveBeenCalled();
  });

  it('stops monitoring and begins shutdown once the Electron parent is gone', () => {
    const timer = scheduler();
    const onParentExit = vi.fn();
    startParentProcessMonitor({
      parentPid: 1234,
      onParentExit,
      isProcessAlive: () => false,
      scheduler: timer.scheduler,
    });

    timer.tick();

    expect(onParentExit).toHaveBeenCalledOnce();
    expect(timer.scheduler.clearInterval).toHaveBeenCalledOnce();
  });

  it('does not monitor standalone hosts without an Electron parent', () => {
    const timer = scheduler();
    const stop = startParentProcessMonitor({
      parentPid: null,
      onParentExit: vi.fn(),
      scheduler: timer.scheduler,
    });

    stop();

    expect(timer.scheduler.setInterval).not.toHaveBeenCalled();
  });
});
