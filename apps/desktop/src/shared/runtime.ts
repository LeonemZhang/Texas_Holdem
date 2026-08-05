import { z } from 'zod';

export interface DesktopRuntimeInfo {
  kind: 'desktop';
  appVersion: string;
  platform: string;
}

export interface DesktopBridge {
  getRuntimeInfo(): Promise<DesktopRuntimeInfo>;
  openRoomRecordManager(): Promise<void>;
  listNetworkInterfaces(): Promise<readonly DesktopNetworkInterface[]>;
  scanLanRooms(
    input: DiscoveryScanInput,
  ): Promise<readonly DesktopDiscoveredRoom[]>;
  startHostService(input: HostStartInput): Promise<HostServiceInfo>;
  getActiveHostService(): Promise<HostServiceInfo | null>;
  stopHostService(): Promise<void>;
  listRoomRecords(
    includeArchived: boolean,
  ): Promise<readonly RoomRecordSummary[]>;
  recoverRoomRecord(
    input: RoomRecordRecoveryInput,
  ): Promise<RecoveredHostSession>;
  closeRunningRoomRecord(roomId: string): Promise<void>;
  archiveRoomRecord(roomId: string): Promise<void>;
  restoreRoomRecord(roomId: string): Promise<void>;
  deleteRoomRecord(roomId: string): Promise<void>;
  copyImageToClipboard(imageDataUrl: string): Promise<void>;
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
  readonly network?: RoomRecordNetwork | null;
}

export interface RoomRecordNetwork {
  readonly name: string;
  readonly address: string;
}

export interface RecoveredHostSession {
  readonly protocolVersion: '3';
  readonly roomId: string;
  readonly playerId: string;
  readonly token: string;
  readonly joinUrl: string;
  readonly socketPath: '/socket.io';
}

export const DiscoveryScanInputSchema = z.object({
  requestId: z.string().trim().min(1).max(128),
  discoveryPort: z.number().int().min(1).max(65_535),
});

export type DiscoveryScanInput = z.infer<typeof DiscoveryScanInputSchema>;

export const HostStartInputSchema = z.object({
  port: z.number().int().min(1).max(65_535),
  advertisedAddress: z.ipv4(),
  networkName: z.string().trim().min(1).max(256).optional(),
});

export type HostStartInput = z.infer<typeof HostStartInputSchema>;

export interface HostServiceInfo {
  readonly port: number;
  readonly advertisedAddress: string;
  readonly joinUrl: string;
  readonly dataDirectory: string;
  readonly networkName?: string;
}

export const RoomRecordRecoveryInputSchema = z.object({
  roomId: z.string().trim().min(1).max(128),
  network: z
    .object({
      name: z.string().trim().min(1).max(256),
      address: z.ipv4(),
    })
    .optional(),
});

export type RoomRecordRecoveryInput = z.infer<
  typeof RoomRecordRecoveryInputSchema
>;

export interface HostServiceExitEvent {
  readonly expected: boolean;
  readonly exitCode: number;
}

export const WindowRoomContextSchema = z.object({
  inRoom: z.boolean(),
  isHost: z.boolean(),
});

export const ClipboardImageDataUrlSchema = z
  .string()
  .max(2_000_000)
  .regex(/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/);

export type WindowRoomContext = z.infer<typeof WindowRoomContextSchema>;

export interface DesktopNetworkInterface {
  readonly name: string;
  readonly address: string;
  readonly netmask: string;
  readonly mac: string;
}

export interface DesktopDiscoveredRoom {
  readonly magic: 'TEXAS_HOLDEM_LAN_V1';
  readonly protocolVersion: '3';
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
