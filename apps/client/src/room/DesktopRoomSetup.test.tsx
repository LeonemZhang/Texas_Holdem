import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DesktopRoomSetup } from './DesktopRoomSetup.js';
import type { HostServiceInfo, RuntimeAdapter } from '../runtime.js';

function runtime(): RuntimeAdapter {
  return {
    getRuntimeInfo: async () => ({
      kind: 'desktop',
      appVersion: '0.0.0',
      platform: 'win32',
    }),
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
        mode="create"
        onClose={vi.fn()}
        onHosted={vi.fn(async (service) => service)}
        onManageRecords={vi.fn(async () => undefined)}
      />,
    );
    expect(
      await screen.findByRole('option', { name: 'Virtual LAN · 10.126.126.1' }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '创建房间' }));
    expect(adapter.startHostService).toHaveBeenCalledWith({
      port: 32_100,
      advertisedAddress: '10.126.126.1',
    });
    expect(
      await screen.findByText('http://10.126.126.1:32100'),
    ).toBeInTheDocument();
    expect(screen.getByTitle('加入房间二维码')).toBeInTheDocument();
  });

  it('reuses an existing host service when creating another room', async () => {
    const adapter = runtime();
    const existingService: HostServiceInfo = {
      port: 32_100,
      advertisedAddress: '10.126.126.9',
      joinUrl: 'http://10.126.126.9:32100',
      dataDirectory: 'rooms',
    };
    const onHosted = vi.fn(async (service: HostServiceInfo) => service);

    render(
      <DesktopRoomSetup
        runtime={adapter}
        mode="create"
        existingService={existingService}
        onClose={vi.fn()}
        onHosted={onHosted}
        onManageRecords={vi.fn(async () => undefined)}
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

  it('shows a dedicated record action without rendering the create form', async () => {
    const adapter = runtime();
    const onManageRecords = vi.fn(async () => undefined);

    render(
      <DesktopRoomSetup
        runtime={adapter}
        mode="records"
        onClose={vi.fn()}
        onHosted={vi.fn(async (service) => service)}
        onManageRecords={onManageRecords}
      />,
    );

    expect(
      await screen.findByRole('button', { name: '打开对局记录' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '创建房间' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '打开对局记录' }));
    await waitFor(() =>
      expect(onManageRecords).toHaveBeenCalledWith(
        expect.objectContaining({ advertisedAddress: '10.126.126.1' }),
      ),
    );
  });
});
