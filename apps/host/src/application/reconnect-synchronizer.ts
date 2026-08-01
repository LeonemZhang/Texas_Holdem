import {
  PROTOCOL_VERSION,
  ResyncResponseSchema,
  type PlayerSnapshot,
  type ResyncRequest,
  type ResyncResponse,
} from '@texas-holdem/protocol';

import type { InMemoryEventBuffer } from './event-buffer.js';
import type { SessionIdentity } from './session-authenticator.js';

export type SnapshotProvider = (
  roomId: string,
  playerId: string,
  sequence: number,
) => PlayerSnapshot | null;

export class ReconnectSynchronizer {
  constructor(
    private readonly events: InMemoryEventBuffer,
    private readonly snapshotProvider: SnapshotProvider,
  ) {}

  synchronize(
    identity: SessionIdentity,
    request: ResyncRequest,
  ): ResyncResponse {
    const read = this.events.readAfter(request.roomId, request.offset);
    if (
      request.roomId !== identity.roomId ||
      request.playerId !== identity.playerId
    ) {
      return ResyncResponseSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        status: 'failed',
        latestSequence: read.latestSequence,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Resynchronization identity does not match the session',
        },
      });
    }
    if (read.continuous) {
      return ResyncResponseSchema.parse({
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
    );
    if (snapshot) {
      return ResyncResponseSchema.parse({
        protocolVersion: PROTOCOL_VERSION,
        status: 'snapshot',
        latestSequence: read.latestSequence,
        snapshot,
      });
    }
    return ResyncResponseSchema.parse({
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
