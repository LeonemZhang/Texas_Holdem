import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DesktopRoomSetup } from './DesktopRoomSetup.js';
import type { RuntimeAdapter } from '../runtime.js';

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
    stopHostService: async () => undefined,
    onHostServiceExited: () => () => undefined,
    setWindowRoomContext: async () => undefined,
    onPlayerExitRequested: () => () => undefined,
  };
}

describe('DesktopRoomSetup', () => {
  it('lets the host select a virtual adapter and starts with its actual address', async () => {
    const adapter = runtime();
    render(<DesktopRoomSetup runtime={adapter} onHosted={vi.fn()} />);
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
});
