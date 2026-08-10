import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DesktopRoomSetup } from './DesktopRoomSetup.js';
import type { HostServiceInfo, RuntimeAdapter } from '../runtime.js';
import { RoomSessionRequestError } from '../connection/room-session-client.js';

function runtime(): RuntimeAdapter {
  return {
    getRuntimeInfo: async () => ({
      kind: 'desktop',
      appVersion: '0.0.0',
      platform: 'win32',
    }),
    openRoomRecordManager: async () => undefined,
    listNetworkInterfaces: async () => [
      {
        name: 'Virtual LAN',
        address: '10.126.126.1',
        netmask: '255.255.255.0',
        mac: '00:11:22:33:44:55',
      },
    ],
    scanLanRooms: async () => [],
    startHostService: vi.fn(async () => ({
      port: 32_100,
      advertisedAddress: '10.126.126.1',
      joinUrl: 'http://10.126.126.1:32100',
      dataDirectory: 'rooms',
    })),
    getActiveHostService: async () => null,
    stopHostService: async () => undefined,
    listRoomRecords: async () => [],
    recoverRoomRecord: async () => {
      throw new Error('unavailable');
    },
    closeRunningRoomRecord: async () => undefined,
    archiveRoomRecord: async () => undefined,
    restoreRoomRecord: async () => undefined,
    deleteRoomRecord: async () => undefined,
    onHostServiceExited: () => () => undefined,
    setWindowRoomContext: async () => undefined,
    onPlayerExitRequested: () => () => undefined,
    onHostCloseRequested: () => () => undefined,
  };
}

describe('DesktopRoomSetup', () => {
  it('lets the host select a virtual adapter and starts with its actual address', async () => {
    const adapter = runtime();
    render(
      <DesktopRoomSetup
        runtime={adapter}
        onClose={vi.fn()}
        onHosted={vi.fn(async (service) => service)}
        onRecovered={vi.fn()}
      />,
    );
    expect(
      await screen.findByRole('option', { name: 'Virtual LAN · 10.126.126.1' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('联机网卡')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: '创建房间' }));
    expect(adapter.startHostService).not.toHaveBeenCalled();
    expect(
      await screen.findByText('请选择用于朋友联机的 IPv4 网卡'),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('联机网卡'), {
      target: { value: '10.126.126.1' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建房间' }));
    expect(adapter.startHostService).toHaveBeenCalledWith({
      port: 32_100,
      advertisedAddress: '10.126.126.1',
      networkName: 'Virtual LAN',
    });
    expect(
      await screen.findByText('http://10.126.126.1:32100'),
    ).toBeInTheDocument();
    expect(screen.getByTitle('加入房间二维码')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '复制二维码' }),
    ).toBeInTheDocument();
  });

  it('reuses an existing host service when creating another room', async () => {
    const adapter = runtime();
    const existingService: HostServiceInfo = {
      port: 32_100,
      advertisedAddress: '10.126.126.9',
      joinUrl: 'http://10.126.126.9:32100',
      dataDirectory: 'rooms',
    };
    adapter.getActiveHostService = async () => existingService;
    const onHosted = vi.fn(async (service: HostServiceInfo) => service);

    render(
      <DesktopRoomSetup
        runtime={adapter}
        existingService={existingService}
        onClose={vi.fn()}
        onHosted={onHosted}
        onRecovered={vi.fn()}
      />,
    );

    expect(
      await screen.findByText(/房主服务已在 10\.126\.126\.9:32100 运行/),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '创建房间' }));

    expect(
      await screen.findByText('http://10.126.126.9:32100'),
    ).toBeInTheDocument();
    expect(adapter.startHostService).not.toHaveBeenCalled();
    expect(onHosted).toHaveBeenCalledWith(existingService, expect.any(Object));
  });

  it('uses the main-process service instead of a stale displayed network address', async () => {
    const adapter = runtime();
    const actualService: HostServiceInfo = {
      port: 32_100,
      advertisedAddress: '10.126.126.1',
      joinUrl: 'http://10.126.126.1:32100',
      dataDirectory: 'rooms',
    };
    const staleService: HostServiceInfo = {
      port: 32_100,
      advertisedAddress: '192.168.3.121',
      joinUrl: 'http://192.168.3.121:32100',
      dataDirectory: 'rooms',
    };
    adapter.getActiveHostService = vi.fn(async () => actualService);
    const onHosted = vi.fn(async () => {
      throw new RoomSessionRequestError(
        '本机已有进行中的对局，请恢复或关闭后再创建。',
        409,
        'ROOM_ALREADY_RUNNING',
        'running-room',
      );
    });

    render(
      <DesktopRoomSetup
        runtime={adapter}
        existingService={staleService}
        onClose={vi.fn()}
        onHosted={onHosted}
        onRecovered={vi.fn()}
      />,
    );

    await screen.findByText(
      '房主服务已在 10.126.126.1:32100 运行，将直接复用。',
    );
    fireEvent.click(screen.getByRole('button', { name: '创建房间' }));

    await screen.findByRole('alertdialog', { name: '本机已有进行中的对局' });
    expect(adapter.startHostService).not.toHaveBeenCalled();
    expect(onHosted).toHaveBeenCalledWith(actualService, expect.any(Object));
  });

  it('offers inline recovery instead of showing an active-room error in English', async () => {
    const adapter = runtime();
    const onRecovered = vi.fn();
    const onHosted = vi.fn(async () => {
      throw new RoomSessionRequestError(
        '本机已有进行中的对局，请恢复或关闭后再创建。',
        409,
        'ROOM_ALREADY_RUNNING',
        'running-room',
      );
    });
    const recoverRoomRecord = vi.fn(async () => ({
      protocolVersion: '3' as const,
      roomId: 'running-room',
      playerId: 'host',
      token: 'host-token-123456',
      joinUrl: 'http://10.126.126.1:32100/?room=running-room',
      socketPath: '/socket.io',
    }));
    adapter.recoverRoomRecord = recoverRoomRecord;

    render(
      <DesktopRoomSetup
        runtime={adapter}
        onClose={vi.fn()}
        onHosted={onHosted}
        onRecovered={onRecovered}
      />,
    );

    await screen.findByRole('option', { name: 'Virtual LAN · 10.126.126.1' });
    fireEvent.change(screen.getByLabelText('联机网卡'), {
      target: { value: '10.126.126.1' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建房间' }));
    const conflict = await screen.findByRole('alertdialog', {
      name: '本机已有进行中的对局',
    });
    expect(conflict).toHaveTextContent('恢复上次对局');
    expect(conflict).not.toHaveTextContent('This host already has a room');

    fireEvent.click(screen.getByRole('button', { name: '恢复上次对局' }));
    await waitFor(() =>
      expect(recoverRoomRecord).toHaveBeenCalledWith({
        roomId: 'running-room',
      }),
    );
    expect(onRecovered).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: 'running-room' }),
    );
  });

  it('explains that another local game process has occupied the host port', async () => {
    const adapter = runtime();
    adapter.startHostService = vi.fn(async () => {
      throw new Error('Host service port is already in use');
    });

    render(
      <DesktopRoomSetup
        runtime={adapter}
        onClose={vi.fn()}
        onHosted={vi.fn(async (service) => service)}
        onRecovered={vi.fn()}
      />,
    );

    await screen.findByRole('option', { name: 'Virtual LAN · 10.126.126.1' });
    fireEvent.change(screen.getByLabelText('联机网卡'), {
      target: { value: '10.126.126.1' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建房间' }));

    expect(
      await screen.findByText(
        '本机的游戏端口已被另一个游戏进程或其他程序占用。请关闭重复打开的 Texas Holdem 后重试。',
      ),
    ).toBeInTheDocument();
  });

  it('stops the host and keeps the form for choosing a new network after closing a running room', async () => {
    const adapter = runtime();
    const existingService: HostServiceInfo = {
      port: 32_100,
      advertisedAddress: '10.126.126.9',
      joinUrl: 'http://10.126.126.9:32100',
      dataDirectory: 'rooms',
    };
    const onHosted = vi
      .fn()
      .mockRejectedValueOnce(
        new RoomSessionRequestError(
          '本机已有进行中的对局，请恢复或关闭后再创建。',
          409,
          'ROOM_ALREADY_RUNNING',
          'running-room',
        ),
      );
    const closeRunningRoomRecord = vi.fn(async () => undefined);
    const stopHostService = vi.fn(async () => undefined);
    adapter.closeRunningRoomRecord = closeRunningRoomRecord;
    adapter.stopHostService = stopHostService;

    render(
      <DesktopRoomSetup
        runtime={adapter}
        existingService={existingService}
        onClose={vi.fn()}
        onHosted={onHosted}
        onRecovered={vi.fn()}
      />,
    );

    await screen.findByText(/房主服务已在 10\.126\.126\.9:32100 运行/);
    fireEvent.click(screen.getByRole('button', { name: '创建房间' }));
    await screen.findByRole('alertdialog', { name: '本机已有进行中的对局' });
    fireEvent.click(
      screen.getByRole('button', { name: '关闭上次对局并重新选择网卡' }),
    );

    await waitFor(() =>
      expect(closeRunningRoomRecord).toHaveBeenCalledWith('running-room'),
    );
    expect(
      await screen.findByText('上次对局已关闭，请重新选择网卡后创建新房间。'),
    ).toBeInTheDocument();
    expect(stopHostService).toHaveBeenCalledOnce();
    expect(onHosted).toHaveBeenCalledOnce();
    expect(screen.getByLabelText('联机网卡')).not.toBeDisabled();
    expect(screen.getByLabelText('联机网卡')).toHaveValue('');
    expect(screen.getByLabelText('房主昵称')).toHaveValue('Alice');
  });

  it('keeps the conflict open with a Chinese error when stopping the host fails', async () => {
    const adapter = runtime();
    adapter.stopHostService = vi.fn(async () => {
      throw new Error('Unable to stop host service');
    });
    const onHosted = vi.fn(async () => {
      throw new RoomSessionRequestError(
        '本机已有进行中的对局，请恢复或关闭后再创建。',
        409,
        'ROOM_ALREADY_RUNNING',
        'running-room',
      );
    });

    render(
      <DesktopRoomSetup
        runtime={adapter}
        onClose={vi.fn()}
        onHosted={onHosted}
        onRecovered={vi.fn()}
      />,
    );

    await screen.findByRole('option', { name: 'Virtual LAN · 10.126.126.1' });
    fireEvent.change(screen.getByLabelText('联机网卡'), {
      target: { value: '10.126.126.1' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建房间' }));
    await screen.findByRole('alertdialog', { name: '本机已有进行中的对局' });
    fireEvent.click(
      screen.getByRole('button', { name: '关闭上次对局并重新选择网卡' }),
    );

    expect(
      await screen.findByText('关闭进行中对局或停止房主服务失败，请重试。'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('alertdialog', { name: '本机已有进行中的对局' }),
    ).toBeInTheDocument();
    expect(onHosted).toHaveBeenCalledOnce();
  });
});
