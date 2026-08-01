import {
  freezeChipRequestBook,
  type ChipRequestBook,
} from './chip-requests.js';
import { freezeRoom, type RoomState } from './room.js';

export interface ChipTransferRecord {
  readonly transferId: string;
  readonly fromPlayerId: string;
  readonly toPlayerId: string;
  readonly amount: number;
  readonly source: 'direct' | 'request-approval';
  readonly requestId: string | null;
}

export interface ChipTransferResult {
  readonly room: RoomState;
  readonly requests: ChipRequestBook;
  readonly transfer: ChipTransferRecord;
}

function transfer(
  room: RoomState,
  requests: ChipRequestBook,
  input: {
    readonly transferId: string;
    readonly fromPlayerId: string;
    readonly toPlayerId: string;
    readonly amount: number;
    readonly source: ChipTransferRecord['source'];
    readonly requestId: string | null;
  },
): ChipTransferResult {
  if (room.phase !== 'hand-ready') {
    throw new RangeError('Chip transfers only occur during hand readiness');
  }
  if (!input.transferId.trim())
    throw new RangeError('Transfer id cannot be empty');
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new RangeError('Transfer amount must be a positive safe integer');
  }
  if (input.fromPlayerId === input.toPlayerId) {
    throw new RangeError('Cannot transfer chips to the same player');
  }
  const giver = room.players.find(
    ({ playerId }) => playerId === input.fromPlayerId,
  );
  const receiver = room.players.find(
    ({ playerId }) => playerId === input.toPlayerId,
  );
  if (!giver || !receiver)
    throw new RangeError('Transfer player is not in the room');
  if (giver.chips < input.amount) {
    throw new RangeError('Giver has insufficient chips');
  }
  const before = room.players.reduce((sum, player) => sum + player.chips, 0);
  const nextRoom = freezeRoom({
    ...room,
    players: room.players.map((player) =>
      player.playerId === giver.playerId
        ? { ...player, chips: player.chips - input.amount }
        : player.playerId === receiver.playerId
          ? { ...player, chips: player.chips + input.amount }
          : player,
    ),
    version: room.version + 1,
  });
  const after = nextRoom.players.reduce((sum, player) => sum + player.chips, 0);
  if (before !== after)
    throw new Error('Chip transfer violated total conservation');
  return Object.freeze({
    room: nextRoom,
    requests,
    transfer: Object.freeze({ ...input }),
  });
}

export function giveChips(
  room: RoomState,
  requests: ChipRequestBook,
  input: {
    readonly transferId: string;
    readonly giverPlayerId: string;
    readonly receiverPlayerId: string;
    readonly amount: number;
  },
): ChipTransferResult {
  return transfer(room, requests, {
    transferId: input.transferId,
    fromPlayerId: input.giverPlayerId,
    toPlayerId: input.receiverPlayerId,
    amount: input.amount,
    source: 'direct',
    requestId: null,
  });
}

export function approveChipRequest(
  room: RoomState,
  requests: ChipRequestBook,
  requestId: string,
  approverPlayerId: string,
  transferId: string,
): ChipTransferResult {
  const request = requests.requests.find(
    (candidate) => candidate.requestId === requestId,
  );
  if (!request || request.status !== 'pending') {
    throw new RangeError(`Chip request is not pending: ${requestId}`);
  }
  if (
    request.targetPlayerId !== null &&
    request.targetPlayerId !== approverPlayerId
  ) {
    throw new RangeError('Only the targeted player can approve this request');
  }
  if (
    request.requesterId === approverPlayerId ||
    request.rejectedByPlayerIds.includes(approverPlayerId)
  ) {
    throw new RangeError('This player cannot approve the request');
  }
  const completed = freezeChipRequestBook({
    ...requests,
    requests: requests.requests.map((candidate) =>
      candidate.requestId === requestId
        ? { ...candidate, status: 'completed' }
        : candidate,
    ),
  });
  return transfer(room, completed, {
    transferId,
    fromPlayerId: approverPlayerId,
    toPlayerId: request.requesterId,
    amount: request.amount,
    source: 'request-approval',
    requestId,
  });
}
