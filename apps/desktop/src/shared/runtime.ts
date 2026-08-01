import { z } from 'zod';

export interface DesktopRuntimeInfo {
  kind: 'desktop';
  appVersion: string;
  platform: string;
}

export interface DesktopBridge {
  getRuntimeInfo(): Promise<DesktopRuntimeInfo>;
  listNetworkInterfaces(): Promise<readonly DesktopNetworkInterface[]>;
  scanLanRooms(
    input: DiscoveryScanInput,
  ): Promise<readonly DesktopDiscoveredRoom[]>;
  startHostService(input: HostStartInput): Promise<HostServiceInfo>;
  stopHostService(): Promise<void>;
  onHostServiceExited(
    listener: (event: HostServiceExitEvent) => void,
  ): () => void;
}

export const DiscoveryScanInputSchema = z.object({
  requestId: z.string().trim().min(1).max(128),
  discoveryPort: z.number().int().min(1).max(65_535),
});

export type DiscoveryScanInput = z.infer<typeof DiscoveryScanInputSchema>;

export const HostStartInputSchema = z.object({
  port: z.number().int().min(1).max(65_535),
  advertisedAddress: z.ipv4(),
});

export type HostStartInput = z.infer<typeof HostStartInputSchema>;

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

export interface DesktopNetworkInterface {
  readonly name: string;
  readonly address: string;
  readonly netmask: string;
  readonly mac: string;
}

export interface DesktopDiscoveredRoom {
  readonly magic: 'TEXAS_HOLDEM_LAN_V1';
  readonly protocolVersion: '1';
  readonly requestId: string;
  readonly type: 'room';
  readonly roomId: string;
  readonly roomName: string;
  readonly hostNickname: string;
  readonly hostAddress: string;
  readonly httpPort: number;
  readonly playerCount: number;
  readonly maxPlayers: number;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly phase: 'lobby' | 'playing' | 'hand-ready' | 'paused';
  readonly lastSeenAtMs: number;
}
