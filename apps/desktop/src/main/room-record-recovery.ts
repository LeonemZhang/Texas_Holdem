import type {
  DesktopNetworkInterface,
  HostServiceInfo,
  HostStartInput,
  RecoveredHostSession,
  RoomRecordRecoveryInput,
} from '../shared/runtime.js';

interface ManagementRequest extends Readonly<Record<string, unknown>> {
  readonly requestId: string;
}

export interface RoomRecordRecoveryHostController {
  current(): HostServiceInfo | null;
  manage(request: ManagementRequest): Promise<unknown>;
  start(input: HostStartInput): Promise<HostServiceInfo>;
  stop(): Promise<void>;
}

interface RoomRecordLike {
  readonly network?: {
    readonly name?: unknown;
    readonly address?: unknown;
  } | null;
}

interface RoomSessionLike {
  readonly protocolVersion?: unknown;
  readonly roomId?: unknown;
  readonly playerId?: unknown;
  readonly sessionType?: unknown;
  readonly hostId?: unknown;
  readonly token?: unknown;
  readonly joinUrl?: unknown;
  readonly socketPath?: unknown;
}

function networkFromRecord(value: unknown): {
  readonly name: string;
  readonly address: string;
} | null {
  if (typeof value !== 'object' || value === null || !('network' in value)) {
    return null;
  }
  const { network } = value as RoomRecordLike;
  if (
    !network ||
    typeof network.name !== 'string' ||
    typeof network.address !== 'string'
  ) {
    return null;
  }
  return { name: network.name, address: network.address };
}

function sessionFromResult(result: unknown): RecoveredHostSession {
  if (typeof result !== 'object' || result === null || !('session' in result)) {
    throw new Error('Invalid room recovery response');
  }
  const session = result.session as RoomSessionLike;
  if (
    typeof session !== 'object' ||
    session === null ||
    session.protocolVersion !== '3' ||
    typeof session.roomId !== 'string' ||
    !session.roomId.trim() ||
    typeof session.playerId !== 'string' ||
    !session.playerId.trim() ||
    typeof session.token !== 'string' ||
    session.token.length < 16 ||
    typeof session.joinUrl !== 'string' ||
    session.socketPath !== '/socket.io'
  ) {
    throw new Error('Invalid room recovery response');
  }
  const sessionType =
    session.sessionType === 'player' || session.sessionType === 'host'
      ? session.sessionType
      : undefined;
  if (session.sessionType !== undefined && sessionType === undefined) {
    throw new Error('Invalid room recovery response');
  }
  const hostId =
    typeof session.hostId === 'string' && session.hostId.trim()
      ? session.hostId
      : undefined;
  if (sessionType === 'host' && !hostId) {
    throw new Error('Invalid room recovery response');
  }
  return {
    protocolVersion: '3',
    roomId: session.roomId,
    playerId: session.playerId,
    ...(sessionType ? { sessionType } : {}),
    ...(hostId ? { hostId } : {}),
    token: session.token,
    joinUrl: session.joinUrl,
    socketPath: '/socket.io',
  };
}

function recoveryRequest(roomId: string, requestId: string): ManagementRequest {
  return {
    protocolVersion: '3',
    requestId,
    type: 'room-record.recover',
    roomId,
  };
}

export async function recoverRoomRecordFromHost({
  controller,
  input,
  networkInterfaces,
  createRequestId,
}: {
  readonly controller: RoomRecordRecoveryHostController;
  readonly input: RoomRecordRecoveryInput;
  readonly networkInterfaces: () => readonly DesktopNetworkInterface[];
  readonly createRequestId: () => string;
}): Promise<RecoveredHostSession> {
  if (controller.current()) {
    return sessionFromResult(
      await controller.manage(recoveryRequest(input.roomId, createRequestId())),
    );
  }

  const recordResult = await controller.manage({
    protocolVersion: '3',
    requestId: createRequestId(),
    type: 'room-record.get',
    roomId: input.roomId,
  });
  if (
    typeof recordResult !== 'object' ||
    recordResult === null ||
    !('record' in recordResult) ||
    !recordResult.record
  ) {
    throw new Error('Invalid room record response');
  }

  const requestedNetwork =
    input.network ?? networkFromRecord(recordResult.record);
  if (!requestedNetwork) {
    throw new Error('该历史记录未保存网卡，请选择可用网卡后恢复。');
  }
  const network = networkInterfaces().find(
    (candidate) => candidate.address === requestedNetwork.address,
  );
  if (!network) {
    throw new Error('上次使用的网卡已不可用，请选择可用网卡后恢复。');
  }

  await controller.start({
    port: 32_100,
    advertisedAddress: network.address,
    networkName: network.name,
  });
  try {
    return sessionFromResult(
      await controller.manage(recoveryRequest(input.roomId, createRequestId())),
    );
  } catch (reason) {
    await controller.stop();
    throw reason;
  }
}
