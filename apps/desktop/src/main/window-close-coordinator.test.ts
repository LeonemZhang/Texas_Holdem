import { describe, expect, it, vi } from 'vitest';

import { WindowCloseCoordinator } from './window-close-coordinator';

describe('WindowCloseCoordinator for ordinary players', () => {
  it('uses confirmed exit as the default path before closing', async () => {
    const event = { preventDefault: vi.fn() };
    const port = {
      confirmPlayerExit: vi.fn(async () => true),
      confirmHostClose: vi.fn(async () => true),
      requestPlayerExit: vi.fn(),
      requestHostClose: vi.fn(),
      closeWindow: vi.fn(),
    };
    const coordinator = new WindowCloseCoordinator(port);
    coordinator.setContext({ inRoom: true, isHost: false });
    coordinator.handleClose(event);
    await vi.waitFor(() =>
      expect(port.requestPlayerExit).toHaveBeenCalledOnce(),
    );
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(port.closeWindow).not.toHaveBeenCalled();

    coordinator.completePlayerExit();
    expect(port.closeWindow).toHaveBeenCalledOnce();
  });

  it('keeps the window open when the player cancels', async () => {
    const port = {
      confirmPlayerExit: vi.fn(async () => false),
      confirmHostClose: vi.fn(async () => true),
      requestPlayerExit: vi.fn(),
      requestHostClose: vi.fn(),
      closeWindow: vi.fn(),
    };
    const coordinator = new WindowCloseCoordinator(port);
    coordinator.setContext({ inRoom: true, isHost: false });
    coordinator.handleClose({ preventDefault: vi.fn() });
    await vi.waitFor(() =>
      expect(port.confirmPlayerExit).toHaveBeenCalledOnce(),
    );
    expect(port.requestPlayerExit).not.toHaveBeenCalled();
    expect(port.closeWindow).not.toHaveBeenCalled();
  });

  it('does not intercept windows that are not in a room', () => {
    const event = { preventDefault: vi.fn() };
    const coordinator = new WindowCloseCoordinator({
      confirmPlayerExit: vi.fn(async () => true),
      confirmHostClose: vi.fn(async () => true),
      requestPlayerExit: vi.fn(),
      requestHostClose: vi.fn(),
      closeWindow: vi.fn(),
    });
    coordinator.handleClose(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('uses a separate confirmed close-room path for the host', async () => {
    const event = { preventDefault: vi.fn() };
    const port = {
      confirmPlayerExit: vi.fn(async () => true),
      confirmHostClose: vi.fn(async () => true),
      requestPlayerExit: vi.fn(),
      requestHostClose: vi.fn(),
      closeWindow: vi.fn(),
    };
    const coordinator = new WindowCloseCoordinator(port);
    coordinator.setContext({ inRoom: true, isHost: true });
    coordinator.handleClose(event);
    await vi.waitFor(() =>
      expect(port.requestHostClose).toHaveBeenCalledOnce(),
    );
    expect(port.requestPlayerExit).not.toHaveBeenCalled();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });
});
