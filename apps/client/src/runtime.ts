import type { RoomSessionResponse } from '@texas-holdem/protocol';

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
  getActiveHostService(): Promise<HostServiceInfo | null>;
  stopHostService(): Promise<void>;
  listRoomRecords(
    includeArchived: boolean,
  ): Promise<readonly RoomRecordSummary[]>;
  recoverRoomRecord(roomId: string): Promise<RoomSessionResponse>;
  archiveRoomRecord(roomId: string): Promise<void>;
  restoreRoomRecord(roomId: string): Promise<void>;
  deleteRoomRecord(roomId: string): Promise<void>;
  onHostServiceExited(
    listener: (event: HostServiceExitEvent) => void,
  ): () => void;
  setWindowRoomContext(context: WindowRoomContext): Promise<void>;
  onPlayerExitRequested(listener: () => void | Promise<void>): () => void;
  onHostCloseRequested(listener: () => void | Promise<void>): () => void;
}

export interface RoomRecordSummary {
  readonly roomId: string;
  readonly roomName: string;
  readonly hostNickname: string;
  readonly status: 'running' | 'recoverable' | 'closed' | 'archived';
  readonly createdAt: string;
  readonly lastActiveAt: string;
  readonly completedHands: number;
  readonly playerCount: number;
}

export interface WindowRoomContext {
  readonly inRoom: boolean;
  readonly isHost: boolean;
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
  async getActiveHostService() {
    return null;
  },
  async stopHostService() {},
  async listRoomRecords() {
    return [];
  },
  async recoverRoomRecord() {
    throw new Error('浏览器不能管理对局记录');
  },
  async archiveRoomRecord() {
    throw new Error('浏览器不能管理对局记录');
  },
  async restoreRoomRecord() {
    throw new Error('浏览器不能管理对局记录');
  },
  async deleteRoomRecord() {
    throw new Error('浏览器不能管理对局记录');
  },
  onHostServiceExited() {
    return () => undefined;
  },
  async setWindowRoomContext() {},
  onPlayerExitRequested() {
    return () => undefined;
  },
  onHostCloseRequested() {
    return () => undefined;
  },
};

export function getRuntimeAdapter(): RuntimeAdapter {
  return window.texasHoldemDesktop ?? browserAdapter;
}
import type { RoomDiscoveryResponse } from '@texas-holdem/lan-discovery/messages';
