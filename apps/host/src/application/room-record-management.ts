import {
  IdSchema,
  type CreateRoomRecordRequest,
  type RoomRecordSummary,
  type RoomSessionResponse,
} from '@texas-holdem/protocol';

import type { RoomRecoveryState } from './persistence-ports.js';

export interface RoomRecordCatalogPort {
  list(includeArchived: boolean): readonly RoomRecordSummary[];
  setArchived(roomId: string, archived: boolean): void;
  delete(roomId: string): void;
}

export interface RecoverableRoomState {
  readonly state: RoomRecoveryState;
  readonly sequence: number;
}

export interface RecoverableRoomLoaderPort {
  loadRecoverable(roomId: string): RecoverableRoomState | null;
}

export interface RoomRecordRuntimePort {
  currentRoomId(): string | null;
  create(
    request: CreateRoomRecordRequest,
    baseJoinUrl: string,
  ): RoomSessionResponse;
  restore(state: RoomRecoveryState, sequence: number): void;
  createRecoveredHostSession(baseJoinUrl: string): RoomSessionResponse;
}

export class RoomRecordManagementService {
  constructor(
    private readonly runtime: RoomRecordRuntimePort,
    private readonly catalog: RoomRecordCatalogPort,
    private readonly loader: RecoverableRoomLoaderPort,
  ) {}

  listRecords(includeArchived = false): readonly RoomRecordSummary[] {
    const runningRoomId = this.runtime.currentRoomId();
    return Object.freeze(
      this.catalog
        .list(includeArchived)
        .map((record) =>
          record.roomId === runningRoomId
            ? Object.freeze({ ...record, status: 'running' as const })
            : record,
        ),
    );
  }

  getRecord(roomId: string): RoomRecordSummary {
    const parsedRoomId = IdSchema.parse(roomId);
    const record = this.listRecords(true).find(
      (candidate) => candidate.roomId === parsedRoomId,
    );
    if (!record) throw new RangeError('Room record does not exist');
    return record;
  }

  createRecord(
    request: CreateRoomRecordRequest,
    baseJoinUrl: string,
  ): RoomSessionResponse {
    if (this.runtime.currentRoomId()) {
      throw new RangeError('A room is already running');
    }
    return this.runtime.create(request, baseJoinUrl);
  }

  recoverRecord(roomId: string, baseJoinUrl: string): RoomSessionResponse {
    const parsedRoomId = IdSchema.parse(roomId);
    if (this.runtime.currentRoomId()) {
      throw new RangeError('A room is already running');
    }
    const record = this.getRecord(parsedRoomId);
    if (record.status !== 'recoverable') {
      throw new RangeError('Only an interrupted room can be recovered');
    }
    const recovered = this.loader.loadRecoverable(parsedRoomId);
    if (!recovered) throw new RangeError('Room record is not recoverable');
    this.runtime.restore(recovered.state, recovered.sequence);
    return this.runtime.createRecoveredHostSession(baseJoinUrl);
  }

  archiveRecord(roomId: string): void {
    const record = this.getRecord(roomId);
    if (record.status === 'running') {
      throw new RangeError('A running room cannot be archived');
    }
    this.catalog.setArchived(record.roomId, true);
  }

  restoreArchivedRecord(roomId: string): void {
    const record = this.getRecord(roomId);
    if (record.status !== 'archived') {
      throw new RangeError('Only an archived room can be restored');
    }
    this.catalog.setArchived(record.roomId, false);
  }

  deleteArchivedRecord(roomId: string): void {
    const record = this.getRecord(roomId);
    if (record.status !== 'archived') {
      throw new RangeError('Only an archived room can be deleted');
    }
    this.catalog.delete(record.roomId);
  }
}
