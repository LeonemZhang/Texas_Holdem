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
  let messageListener: ((message: unknown) => void) | null = null;
  const process: HostSubprocess = {
    once: (_event, listener) => {
      exitListener = listener;
    },
    on: (_event, listener) => {
      messageListener = listener;
    },
    kill: vi.fn(() => true),
    postMessage: vi.fn(),
  };
  return {
    process,
    exit: (code: number) => exitListener?.(code),
    send: (message: unknown) => messageListener?.(message),
  };
}

function readySpawn(child: ReturnType<typeof fakeProcess>) {
  return vi.fn((input: SpawnHostProcessInput) => {
    queueMicrotask(() =>
      child.send({
        type: 'host.ready',
        instanceId: input.env.HOST_INSTANCE_ID,
      }),
    );
    return child.process;
  });
}

describe('HostProcessController', () => {
  it('starts only on request with explicit network and data settings, then waits for health', async () => {
    const child = fakeProcess();
    const spawn = readySpawn(child);
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

  it('reuses the running host for the same address instead of spawning twice', async () => {
    const child = fakeProcess();
    const spawn = readySpawn(child);
    const controller = new HostProcessController({
      dataDirectory: join(tmpdir(), `texas-desktop-${Date.now()}-reuse`),
      staticDirectory: 'client-dist',
      spawn,
      healthCheck: async () => true,
    });
    const input = { port: 32_100, advertisedAddress: '10.126.126.1' };

    const first = await controller.start(input);
    expect(controller.current()).toBe(first);
    await expect(controller.start(input)).resolves.toBe(first);
    expect(spawn).toHaveBeenCalledOnce();
    await expect(
      controller.start({ ...input, advertisedAddress: '192.168.3.121' }),
    ).rejects.toThrow('another address');
  });

  it('does not mistake another process health response for its own host service', async () => {
    const child = fakeProcess();
    const controller = new HostProcessController({
      dataDirectory: join(tmpdir(), `texas-desktop-${Date.now()}-foreign`),
      staticDirectory: 'client-dist',
      spawn: () => child.process,
      healthCheck: async () => true,
      delay: async () => undefined,
      readinessAttempts: 1,
    });

    await expect(
      controller.start({ port: 32_104, advertisedAddress: '127.0.0.1' }),
    ).rejects.toThrow('another host may still be using this port');
    expect(child.process.kill).toHaveBeenCalledOnce();
  });

  it('reports unexpected exits without exposing the subprocess', async () => {
    const child = fakeProcess();
    const controller = new HostProcessController({
      dataDirectory: join(tmpdir(), `texas-desktop-${Date.now()}-exit`),
      staticDirectory: 'client-dist',
      spawn: readySpawn(child),
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
      spawn: readySpawn(child),
      healthCheck: async () => true,
    });
    const listener = vi.fn();
    controller.subscribe(listener);
    await controller.start({ port: 32_102, advertisedAddress: '127.0.0.2' });
    controller.stop();
    child.exit(0);
    expect(listener).toHaveBeenCalledWith({ expected: true, exitCode: 0 });
    expect(controller.current()).toBeNull();
  });

  it('relays validated room-record management messages to the host process', async () => {
    const child = fakeProcess();
    const controller = new HostProcessController({
      dataDirectory: join(tmpdir(), `texas-desktop-${Date.now()}-records`),
      staticDirectory: 'client-dist',
      spawn: readySpawn(child),
      healthCheck: async () => true,
    });
    await controller.start({ port: 32_103, advertisedAddress: '127.0.0.1' });

    const result = controller.manage({
      protocolVersion: '1',
      requestId: 'request-1',
      type: 'room-record.list',
      includeArchived: false,
    });
    expect(child.process.postMessage).toHaveBeenCalledOnce();
    child.send({
      protocolVersion: '1',
      requestId: 'request-1',
      status: 'accepted',
      result: [],
    });

    await expect(result).resolves.toEqual([]);
  });
});
