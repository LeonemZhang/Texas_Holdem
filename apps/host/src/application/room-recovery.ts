import { applyHandAction, type BettingAction } from '@texas-holdem/poker-core';
import type { DomainEvent } from '@texas-holdem/protocol';

import { freezeRoom } from '../domain/room.js';
import type {
  EventStorePort,
  RoomRecoveryState,
  SnapshotStorePort,
} from './persistence-ports.js';

export interface RoomRecoveryCatalogPort {
  isNormallyClosed(roomId: string): boolean;
}

export class RoomRecoveryError extends Error {
  constructor(
    readonly code:
      'SNAPSHOT_NOT_FOUND' | 'EVENT_SEQUENCE_GAP' | 'UNREPLAYABLE_EVENT',
    message: string,
  ) {
    super(message);
    this.name = 'RoomRecoveryError';
  }
}

function actionFromEvent(
  event: Extract<DomainEvent, { type: 'hand.player-acted' }>,
): BettingAction {
  if (event.action === 'raiseTo') {
    if (event.amount === undefined) {
      throw new RoomRecoveryError(
        'UNREPLAYABLE_EVENT',
        'A raise event requires its target amount',
      );
    }
    return { type: 'raiseTo', amount: event.amount };
  }
  if (event.action === 'allIn') return { type: 'allIn' };
  return { type: event.action };
}

export function replayRecoveryEvent(
  state: RoomRecoveryState,
  event: DomainEvent,
): RoomRecoveryState {
  if (event.roomId !== state.room.roomId) {
    throw new RoomRecoveryError(
      'UNREPLAYABLE_EVENT',
      'Recovery event belongs to another room',
    );
  }
  let room = state.room;
  let hand = state.hand;
  let handReady = state.handReady;

  switch (event.type) {
    case 'room.control-changed':
      room = freezeRoom({ ...room, phase: event.phase });
      break;
    case 'player.status-changed':
      room = freezeRoom({
        ...room,
        players: room.players.map((player) =>
          player.playerId === event.playerId
            ? { ...player, status: event.status }
            : player,
        ),
      });
      break;
    case 'lobby.ready-changed':
      room = freezeRoom({
        ...room,
        players: room.players.map((player) =>
          player.playerId === event.playerId
            ? { ...player, lobbyReady: event.ready }
            : player,
        ),
      });
      break;
    case 'hand.player-acted':
      if (!hand || hand.handId !== event.handId) {
        throw new RoomRecoveryError(
          'UNREPLAYABLE_EVENT',
          'Player action has no matching hand snapshot',
        );
      }
      hand = applyHandAction(hand, event.playerId, actionFromEvent(event));
      break;
    case 'hand-ready.choice-changed':
      if (!handReady) {
        throw new RoomRecoveryError(
          'UNREPLAYABLE_EVENT',
          'Ready choice has no matching hand-ready snapshot',
        );
      }
      handReady = Object.freeze({
        ...handReady,
        players: Object.freeze(
          handReady.players.map((player) =>
            player.playerId === event.playerId
              ? Object.freeze({ ...player, choice: event.choice })
              : player,
          ),
        ),
      });
      break;
    case 'chips.transfer-completed':
      room = freezeRoom({
        ...room,
        players: room.players.map((player) =>
          player.playerId === event.fromPlayerId
            ? { ...player, chips: player.chips - event.amount }
            : player.playerId === event.toPlayerId
              ? { ...player, chips: player.chips + event.amount }
              : player,
        ),
      });
      break;
    case 'statistics.updated':
    case 'statistics.titles-updated':
      break;
    default:
      throw new RoomRecoveryError(
        'UNREPLAYABLE_EVENT',
        `Event ${event.type} requires a newer authoritative snapshot`,
      );
  }
  room = freezeRoom({ ...room, version: event.stateVersion });
  return Object.freeze({
    room,
    hand,
    handReady,
    chipRequests: state.chipRequests,
    chipActivity: state.chipActivity,
  });
}

export function recoverRoom(
  roomId: string,
  catalog: RoomRecoveryCatalogPort,
  snapshots: SnapshotStorePort,
  events: EventStorePort,
): RoomRecoveryState | null {
  if (catalog.isNormallyClosed(roomId)) return null;
  const snapshot = snapshots.latest(roomId);
  if (!snapshot) {
    throw new RoomRecoveryError(
      'SNAPSHOT_NOT_FOUND',
      `No authoritative snapshot exists for room ${roomId}`,
    );
  }
  const subsequent = events.readAfter(roomId, snapshot.sequence);
  let expectedSequence = snapshot.sequence + 1;
  let state = snapshot.state;
  for (const event of subsequent) {
    if (event.sequence !== expectedSequence) {
      throw new RoomRecoveryError(
        'EVENT_SEQUENCE_GAP',
        `Expected event ${expectedSequence}, received ${event.sequence}`,
      );
    }
    state = replayRecoveryEvent(state, event);
    expectedSequence += 1;
  }
  return state;
}
