import {
  JoinBootstrapResponseSchema,
  JoinRoomSessionRequestSchema,
  ResumeRoomSessionRequestSchema,
  RoomSessionResponseSchema,
  type JoinBootstrapResponse,
  type JoinRoomSessionRequest,
  type ResumeRoomSessionRequest,
} from '@texas-holdem/protocol';
import { io, type Socket } from 'socket.io-client';
import { z } from 'zod';

const CurrentRoomResponseSchema = z.object({ roomId: z.string().min(1) });

export interface JoinResult {
  readonly roomId: string;
  readonly playerId: string;
  readonly sessionToken: string;
}

export async function fetchBootstrap(
  hostUrl: string,
): Promise<JoinBootstrapResponse> {
  const response = await fetch(`${hostUrl}/api/bootstrap`);
  if (!response.ok) {
    throw new Error(`Bootstrap failed: ${response.status}`);
  }
  const raw: unknown = await response.json();
  return JoinBootstrapResponseSchema.parse(raw);
}

export async function fetchCurrentRoom(hostUrl: string): Promise<string> {
  const response = await fetch(`${hostUrl}/api/rooms/current`);
  if (!response.ok) {
    throw new Error(`No active room: ${response.status}`);
  }
  const raw: unknown = await response.json();
  return CurrentRoomResponseSchema.parse(raw).roomId;
}

export async function joinRoom(
  hostUrl: string,
  nickname: string,
): Promise<JoinResult> {
  const roomId = await fetchCurrentRoom(hostUrl);
  const body: JoinRoomSessionRequest = { nickname };
  JoinRoomSessionRequestSchema.parse(body);
  const response = await fetch(`${hostUrl}/api/rooms/${roomId}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Join failed: ${response.status} ${errorText}`);
  }
  const session = RoomSessionResponseSchema.parse(await response.json());
  return {
    roomId: session.roomId,
    playerId: session.playerId,
    sessionToken: session.token,
  };
}

export async function resumeRoom(
  hostUrl: string,
  roomId: string,
  playerId: string,
  token: string,
  nickname?: string,
): Promise<JoinResult> {
  const body: ResumeRoomSessionRequest = nickname
    ? { playerId, token, nickname }
    : { playerId, token };
  ResumeRoomSessionRequestSchema.parse(body);
  const response = await fetch(`${hostUrl}/api/rooms/${roomId}/resume`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`Resume failed: ${response.status} ${errorText}`);
  }
  const session = RoomSessionResponseSchema.parse(await response.json());
  return {
    roomId: session.roomId,
    playerId: session.playerId,
    sessionToken: session.token,
  };
}

export function connectSocket(
  hostUrl: string,
  roomId: string,
  playerId: string,
  sessionToken: string,
): Socket {
  return io(hostUrl, {
    auth: { protocolVersion: '3', roomId, playerId, token: sessionToken },
    path: '/socket.io',
    transports: ['websocket'],
    reconnection: false,
  });
}
