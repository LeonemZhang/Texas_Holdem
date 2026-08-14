import {
  PROTOCOL_VERSION,
  ResyncHostResponseSchema,
  ResyncResponseSchema,
  type HostManagementSnapshot,
  type PlayerSnapshot,
  type ResyncHostResponse,
  type ResyncRequest,
  type ResyncResponse,
} from '@texas-holdem/protocol';

import type { InMemoryEventBuffer } from './event-buffer.js';
import type { SessionIdentity } from './session-authenticator.js';

export type SnapshotProvider = (
  roomId: string,
  identityId: string,
  sequence: number,
  sessionType?: 'player' | 'host',
) => PlayerSnapshot | HostManagementSnapshot | null;

export class ReconnectSynchronizer {
  constructor(
    private readonly events: InMemoryEventBuffer,
    private readonly snapshotProvider: SnapshotProvider,
  ) {}

  synchronize(
    identity: SessionIdentity,
    request: ResyncRequest,
  ): ResyncResponse | ResyncHostResponse {
    const responseSchema =
      identity.sessionType === 'host'
        ? ResyncHostResponseSchema
        : ResyncResponseSchema;
    const read = this.events.readAfter(request.roomId, request.offset);
    if (
      request.roomId !== identity.roomId ||
      request.playerId !== identity.playerId
    ) {
      return responseSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        status: 'failed',
        latestSequence: read.latestSequence,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Resynchronization identity does not match the session',
        },
      });
    }
    if (
      (request.sessionType ?? 'player') !==
        (identity.sessionType ?? 'player') ||
      (identity.sessionType === 'host' && request.hostId !== identity.hostId) ||
      (request.hostId !== undefined && request.hostId !== identity.hostId)
    ) {
      return responseSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        status: 'failed',
        latestSequence: read.latestSequence,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Resynchronization role does not match the session',
        },
      });
    }
    if (read.continuous) {
      return responseSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        status: 'events',
        latestSequence: read.latestSequence,
        events: read.events,
      });
    }
    const snapshot = this.snapshotProvider(
      identity.roomId,
      identity.playerId,
      read.latestSequence,
      identity.sessionType,
    );
    if (snapshot) {
      return responseSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        status: 'snapshot',
        latestSequence: read.latestSequence,
        snapshot,
      });
    }
    return responseSchema.parse({
      protocolVersion: PROTOCOL_VERSION,
      status: 'failed',
      latestSequence: read.latestSequence,
      error: {
        code: 'RESYNC_REQUIRED',
        message: 'Event gap requires a snapshot, but no snapshot is available',
      },
    });
  }
}
