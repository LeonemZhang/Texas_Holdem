import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it, vi } from 'vitest';

import {
  HostProcessController,
  type HostSubprocess,
  type SpawnHostProcessInput,
} from './host-process-controller';

const isPortAvailable = async () => true;

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
      isPortAvailable,
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
      isPortAvailable,
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

  it('does not spawn a second host when another local process already owns the port', async () => {
    const spawn = vi.fn();
    const portAvailable = vi.fn(async () => false);
    const controller = new HostProcessController({
      dataDirectory: join(tmpdir(), `texas-desktop-${Date.now()}-occupied`),
      staticDirectory: 'client-dist',
      spawn,
      isPortAvailable: portAvailable,
    });

    await expect(
      controller.start({ port: 32_100, advertisedAddress: '10.126.126.1' }),
    ).rejects.toThrow('Host service port is already in use');
    expect(portAvailable).toHaveBeenCalledWith(32_100);
    expect(spawn).not.toHaveBeenCalled();
  });

  it('starts record management without a LAN listener or health check', async () => {
    const child = fakeProcess();
    const spawn = readySpawn(child);
    const healthCheck = vi.fn(async () => true);
    const controller = new HostProcessController({
      dataDirectory: join(tmpdir(), `texas-desktop-${Date.now()}-records-only`),
      staticDirectory: 'client-dist',
      spawn,
      isPortAvailable,
      healthCheck,
      delay: async () => undefined,
    });

    await expect(controller.startManagement()).resolves.toBeUndefined();
    expect(controller.current()).toBeNull();
    expect(spawn).toHaveBeenCalledWith({
      env: expect.objectContaining({ HOST_MODE: 'management' }),
    });
    expect(spawn.mock.calls[0]?.[0].env.HOST_PORT).toBeUndefined();
    expect(healthCheck).not.toHaveBeenCalled();
  });

  it('does not mistake another process health response for its own host service', async () => {
    const child = fakeProcess();
    const controller = new HostProcessController({
      dataDirectory: join(tmpdir(), `texas-desktop-${Date.now()}-foreign`),
      staticDirectory: 'client-dist',
      spawn: () => child.process,
      isPortAvailable,
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
      isPortAvailable,
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
      isPortAvailable,
      healthCheck: async () => true,
    });
    const listener = vi.fn();
    controller.subscribe(listener);
    await controller.start({ port: 32_102, advertisedAddress: '127.0.0.2' });
    const stopped = controller.stop();
    child.exit(0);
    await stopped;
    expect(listener).toHaveBeenCalledWith({ expected: true, exitCode: 0 });
    expect(controller.current()).toBeNull();
  });

  it('waits for the host exit before allowing a different network address', async () => {
    const first = fakeProcess();
    const second = fakeProcess();
    const children = [first, second];
    const spawn = vi.fn((input: SpawnHostProcessInput) => {
      const child = children[spawn.mock.calls.length - 1]!;
      queueMicrotask(() =>
        child.send({
          type: 'host.ready',
          instanceId: input.env.HOST_INSTANCE_ID,
        }),
      );
      return child.process;
    });
    const controller = new HostProcessController({
      dataDirectory: join(tmpdir(), `texas-desktop-${Date.now()}-switch`),
      staticDirectory: 'client-dist',
      spawn,
      isPortAvailable,
      healthCheck: async () => true,
    });
    await controller.start({ port: 32_100, advertisedAddress: '10.126.126.1' });

    const stopped = controller.stop();
    expect(first.process.kill).toHaveBeenCalledOnce();
    first.exit(0);
    await stopped;

    await expect(
      controller.start({ port: 32_100, advertisedAddress: '192.168.3.121' }),
    ).resolves.toMatchObject({ advertisedAddress: '192.168.3.121' });
    expect(spawn).toHaveBeenCalledTimes(2);
  });

  it('relays validated room-record management messages to the host process', async () => {
    const child = fakeProcess();
    const controller = new HostProcessController({
      dataDirectory: join(tmpdir(), `texas-desktop-${Date.now()}-records`),
      staticDirectory: 'client-dist',
      spawn: readySpawn(child),
      isPortAvailable,
      healthCheck: async () => true,
    });
    await controller.start({ port: 32_103, advertisedAddress: '127.0.0.1' });

    const result = controller.manage({
      protocolVersion: '3',
      requestId: 'request-1',
      type: 'room-record.list',
      includeArchived: false,
    });
    expect(child.process.postMessage).toHaveBeenCalledOnce();
    child.send({
      protocolVersion: '3',
      requestId: 'request-1',
      status: 'accepted',
      result: [],
    });

    await expect(result).resolves.toEqual([]);
  });
});
