export type RuntimeKind = 'browser' | 'desktop';

export interface RuntimeInfo {
  kind: RuntimeKind;
  appVersion: string;
  platform: string;
}

export interface RuntimeAdapter {
  getRuntimeInfo(): Promise<RuntimeInfo>;
  listNetworkInterfaces(): Promise<readonly DesktopNetworkInterface[]>;
  scanLanRooms(input: {
    readonly requestId: string;
    readonly discoveryPort: number;
  }): Promise<readonly DesktopDiscoveredRoom[]>;
  startHostService(input: {
    readonly port: number;
    readonly advertisedAddress: string;
  }): Promise<HostServiceInfo>;
  stopHostService(): Promise<void>;
  onHostServiceExited(
    listener: (event: HostServiceExitEvent) => void,
  ): () => void;
}

export interface DesktopNetworkInterface {
  readonly name: string;
  readonly address: string;
  readonly netmask: string;
  readonly mac: string;
}

export interface DesktopDiscoveredRoom extends RoomDiscoveryResponse {
  readonly lastSeenAtMs: number;
}

export interface HostServiceInfo {
  readonly port: number;
  readonly advertisedAddress: string;
  readonly joinUrl: string;
  readonly dataDirectory: string;
}

export interface HostServiceExitEvent {
  readonly expected: boolean;
  readonly exitCode: number;
}

declare global {
  interface Window {
    texasHoldemDesktop?: RuntimeAdapter;
  }
}

const browserAdapter: RuntimeAdapter = {
  async getRuntimeInfo() {
    return {
      kind: 'browser',
      appVersion: 'web',
      platform: navigator.platform || 'web',
    };
  },
  async listNetworkInterfaces() {
    return [];
  },
  async scanLanRooms() {
    return [];
  },
  async startHostService() {
    throw new Error('浏览器不能启动房主服务');
  },
  async stopHostService() {},
  onHostServiceExited() {
    return () => undefined;
  },
};

export function getRuntimeAdapter(): RuntimeAdapter {
  return window.texasHoldemDesktop ?? browserAdapter;
}
import type { RoomDiscoveryResponse } from '@texas-holdem/lan-discovery/messages';
