import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { NetworkDiagnostics } from './NetworkDiagnostics.js';
import type { RuntimeAdapter } from '../runtime.js';

function adapter(): RuntimeAdapter {
  return {
    getRuntimeInfo: async () => ({
      kind: 'desktop',
      appVersion: '0.0.0',
      platform: 'win32',
    }),
    listNetworkInterfaces: vi.fn(async () => [
      {
        name: 'Virtual LAN',
        address: '10.126.126.1',
        netmask: '255.255.255.0',
        mac: '00:11:22:33:44:55',
      },
    ]),
    scanLanRooms: async () => [],
    startHostService: async () => ({
      port: 32_100,
      advertisedAddress: '10.126.126.1',
      joinUrl: 'http://10.126.126.1:32100',
      dataDirectory: 'rooms',
    }),
    stopHostService: async () => undefined,
    onHostServiceExited: () => () => undefined,
    setWindowRoomContext: async () => undefined,
    onPlayerExitRequested: () => () => undefined,
    onHostCloseRequested: () => () => undefined,
  };
}

describe('NetworkDiagnostics', () => {
  it('shows virtual adapters, explicit ports, invitation and firewall fallback', async () => {
    const runtime = adapter();
    render(
      <NetworkDiagnostics
        runtime={runtime}
        hostService={{
          port: 32_100,
          advertisedAddress: '10.126.126.1',
          joinUrl: 'http://10.126.126.1:32100',
          dataDirectory: 'rooms',
        }}
      />,
    );
    fireEvent.click(screen.getByText('网络诊断'));
    expect(await screen.findByText('Virtual LAN')).toBeInTheDocument();
    expect(screen.getByText('10.126.126.1')).toBeInTheDocument();
    expect(screen.getByText('32100 / TCP')).toBeInTheDocument();
    expect(screen.getByText('32101 / UDP')).toBeInTheDocument();
    expect(screen.getByText(/Windows 防火墙/)).toBeInTheDocument();
    expect(screen.getByText(/IP 直连/)).toBeInTheDocument();
  });
});
