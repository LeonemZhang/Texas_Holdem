import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';

import {
  HostProcessController,
  type HostSubprocess,
  type SpawnHostProcessInput,
} from './host-process-controller';

function fakeProcess() {
  let exitListener: ((code: number) => void) | null = null;
  const process: HostSubprocess = {
    once: (_event, listener) => {
      exitListener = listener;
    },
    kill: vi.fn(() => true),
  };
  return { process, exit: (code: number) => exitListener?.(code) };
}

describe('HostProcessController', () => {
  it('starts only on request with explicit network and data settings, then waits for health', async () => {
    const child = fakeProcess();
    const spawn = vi.fn((_input: SpawnHostProcessInput) => child.process);
    const healthCheck = vi
      .fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true);
    const dataDirectory = join(tmpdir(), `texas-desktop-${Date.now()}`);
    const controller = new HostProcessController({
      dataDirectory,
      staticDirectory: 'client-dist',
      spawn,
      healthCheck,
      delay: async () => undefined,
    });
    expect(spawn).not.toHaveBeenCalled();
    await expect(
      controller.start({ port: 32_100, advertisedAddress: '10.126.126.1' }),
    ).resolves.toMatchObject({
      joinUrl: 'http://10.126.126.1:32100',
      dataDirectory,
    });
    expect(spawn).toHaveBeenCalledWith({
      env: expect.objectContaining({
        HOST_PORT: '32100',
        HOST_ADVERTISED_ADDRESS: '10.126.126.1',
        HOST_DATA_DIR: dataDirectory,
        CLIENT_DIST_DIR: 'client-dist',
      }),
    });
    expect(healthCheck).toHaveBeenCalledTimes(2);
  });

  it('reports unexpected exits without exposing the subprocess', async () => {
    const child = fakeProcess();
    const controller = new HostProcessController({
      dataDirectory: join(tmpdir(), `texas-desktop-${Date.now()}-exit`),
      staticDirectory: 'client-dist',
      spawn: () => child.process,
      healthCheck: async () => true,
    });
    const listener = vi.fn();
    controller.subscribe(listener);
    await controller.start({ port: 32_101, advertisedAddress: '192.168.1.8' });
    child.exit(7);
    expect(listener).toHaveBeenCalledWith({ expected: false, exitCode: 7 });
  });

  it('distinguishes an expected stop', async () => {
    const child = fakeProcess();
    const controller = new HostProcessController({
      dataDirectory: join(tmpdir(), `texas-desktop-${Date.now()}-stop`),
      staticDirectory: 'client-dist',
      spawn: () => child.process,
      healthCheck: async () => true,
    });
    const listener = vi.fn();
    controller.subscribe(listener);
    await controller.start({ port: 32_102, advertisedAddress: '127.0.0.2' });
    controller.stop();
    child.exit(0);
    expect(listener).toHaveBeenCalledWith({ expected: true, exitCode: 0 });
  });
});
