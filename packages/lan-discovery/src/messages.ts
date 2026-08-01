import { PROTOCOL_VERSION } from '@texas-holdem/protocol';
import { z } from 'zod';

export const DISCOVERY_MAGIC = 'TEXAS_HOLDEM_LAN_V1' as const;
export const DEFAULT_HTTP_PORT = 32_100;
export const DEFAULT_DISCOVERY_PORT = 32_101;

const envelope = {
  magic: z.literal(DISCOVERY_MAGIC),
  protocolVersion: z.literal(PROTOCOL_VERSION),
  requestId: z.string().trim().min(1).max(128),
} as const;

export const DiscoveryRequestSchema = z
  .object({
    ...envelope,
    type: z.literal('discover'),
  })
  .strict();

export const RoomDiscoveryResponseSchema = z
  .object({
    ...envelope,
    type: z.literal('room'),
    roomId: z.string().trim().min(1).max(128),
    roomName: z.string().trim().min(1).max(200),
    hostNickname: z.string().trim().min(1).max(100),
    hostAddress: z.ipv4(),
    httpPort: z.number().int().min(1).max(65_535),
    playerCount: z.number().int().min(1).max(10),
    maxPlayers: z.number().int().min(2).max(10),
    smallBlind: z.number().int().positive().safe(),
    bigBlind: z.number().int().positive().safe(),
    phase: z.enum(['lobby', 'playing', 'hand-ready', 'paused']),
  })
  .strict()
  .refine((response) => response.playerCount <= response.maxPlayers, {
    message: 'Player count cannot exceed room capacity',
    path: ['playerCount'],
  })
  .refine((response) => response.bigBlind === response.smallBlind * 2, {
    message: 'Big blind must be twice the small blind',
    path: ['bigBlind'],
  });

export type DiscoveryRequest = z.infer<typeof DiscoveryRequestSchema>;
export type RoomDiscoveryResponse = z.infer<typeof RoomDiscoveryResponseSchema>;
