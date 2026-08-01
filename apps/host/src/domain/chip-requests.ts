import type { HandReadyState } from './hand-ready.js';
import type { RoomState } from './room.js';

export type ChipRequestStatus =
  'pending' | 'rejected' | 'revoked' | 'completed';

export interface ChipRequest {
  readonly requestId: string;
  readonly requesterId: string;
  readonly targetPlayerId: string | null;
  readonly amount: number;
  readonly note: string | null;
  readonly status: ChipRequestStatus;
  readonly rejectedByPlayerIds: readonly string[];
}

export interface ChipRequestBook {
  readonly roomId: string;
  readonly afterHandId: string;
  readonly requests: readonly ChipRequest[];
}

export function createChipRequestBook(
  handReady: HandReadyState,
): ChipRequestBook {
  return Object.freeze({
    roomId: handReady.roomId,
    afterHandId: handReady.afterHandId,
    requests: Object.freeze([]),
  });
}

export function freezeChipRequestBook(book: ChipRequestBook): ChipRequestBook {
  return Object.freeze({
    ...book,
    requests: Object.freeze(
      book.requests.map((request) =>
        Object.freeze({
          ...request,
          rejectedByPlayerIds: Object.freeze([...request.rejectedByPlayerIds]),
        }),
      ),
    ),
  });
}

function requirePending(book: ChipRequestBook, requestId: string): ChipRequest {
  const request = book.requests.find(
    (candidate) => candidate.requestId === requestId,
  );
  if (!request) throw new RangeError(`Chip request not found: ${requestId}`);
  if (request.status !== 'pending') {
    throw new RangeError(`Chip request is not pending: ${requestId}`);
  }
  return request;
}

export function createChipRequest(
  room: RoomState,
  handReady: HandReadyState,
  book: ChipRequestBook,
  input: {
    readonly requestId: string;
    readonly requesterId: string;
    readonly targetPlayerId: string | null;
    readonly amount: number;
    readonly note?: string;
  },
): ChipRequestBook {
  if (
    room.phase !== 'hand-ready' ||
    handReady.roomId !== room.roomId ||
    book.afterHandId !== handReady.afterHandId
  ) {
    throw new RangeError(
      'Chip requests only exist in the active hand-ready phase',
    );
  }
  if (
    !input.requestId.trim() ||
    book.requests.some(({ requestId }) => requestId === input.requestId)
  ) {
    throw new RangeError('Chip request id must be non-empty and unique');
  }
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) {
    throw new RangeError('Requested chips must be a positive safe integer');
  }
  const requester = room.players.find(
    ({ playerId }) => playerId === input.requesterId,
  );
  if (!requester || ['left', 'eliminated'].includes(requester.status)) {
    throw new RangeError(`Requester is not seated: ${input.requesterId}`);
  }
  if (input.targetPlayerId === input.requesterId) {
    throw new RangeError('A player cannot request chips from themselves');
  }
  if (
    input.targetPlayerId !== null &&
    !room.players.some(
      ({ playerId, status }) =>
        playerId === input.targetPlayerId &&
        !['left', 'eliminated'].includes(status),
    )
  ) {
    throw new RangeError(
      `Target player is not seated: ${input.targetPlayerId}`,
    );
  }
  const note = input.note?.trim() || null;
  return freezeChipRequestBook({
    ...book,
    requests: [
      ...book.requests,
      {
        requestId: input.requestId,
        requesterId: input.requesterId,
        targetPlayerId: input.targetPlayerId,
        amount: input.amount,
        note,
        status: 'pending',
        rejectedByPlayerIds: [],
      },
    ],
  });
}

export function revokeChipRequest(
  book: ChipRequestBook,
  requestId: string,
  actorPlayerId: string,
): ChipRequestBook {
  const request = requirePending(book, requestId);
  if (request.requesterId !== actorPlayerId) {
    throw new RangeError('Only the requester can revoke a chip request');
  }
  return freezeChipRequestBook({
    ...book,
    requests: book.requests.map((candidate) =>
      candidate.requestId === requestId
        ? { ...candidate, status: 'revoked' }
        : candidate,
    ),
  });
}

export function rejectChipRequest(
  room: RoomState,
  book: ChipRequestBook,
  requestId: string,
  actorPlayerId: string,
): ChipRequestBook {
  const request = requirePending(book, requestId);
  if (request.requesterId === actorPlayerId) {
    throw new RangeError('The requester cannot reject their own request');
  }
  if (
    request.targetPlayerId !== null &&
    request.targetPlayerId !== actorPlayerId
  ) {
    throw new RangeError('Only the targeted player can reject this request');
  }
  const rejectedBy = [
    ...new Set([...request.rejectedByPlayerIds, actorPlayerId]),
  ];
  const possibleDonors = room.players.filter(
    ({ playerId, status }) =>
      playerId !== request.requesterId &&
      !['left', 'eliminated'].includes(status),
  );
  const fullyRejected =
    request.targetPlayerId !== null ||
    possibleDonors.every(({ playerId }) => rejectedBy.includes(playerId));
  return freezeChipRequestBook({
    ...book,
    requests: book.requests.map((candidate) =>
      candidate.requestId === requestId
        ? {
            ...candidate,
            status: fullyRejected ? 'rejected' : 'pending',
            rejectedByPlayerIds: rejectedBy,
          }
        : candidate,
    ),
  });
}
