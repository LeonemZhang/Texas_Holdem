import {
  PROTOCOL_VERSION,
  type DomainEvent,
  type PlayerSnapshot,
} from '@texas-holdem/protocol';

import type { ConnectionAdapter } from '../connection/connection.js';

export interface GameClientState {
  readonly roomId: string;
  readonly playerId: string;
  readonly sequence: number;
  readonly snapshot: PlayerSnapshot | null;
  readonly recentEvents: readonly DomainEvent[];
  readonly synchronizing: boolean;
  readonly synchronizationError: string | null;
}

export class GameClientStore {
  #state: GameClientState;
  #resynchronization: Promise<void> | null = null;
  readonly #listeners = new Set<(state: GameClientState) => void>();

  constructor(
    roomId: string,
    playerId: string,
    private readonly connection: ConnectionAdapter,
  ) {
    this.#state = Object.freeze({
      roomId,
      playerId,
      sequence: 0,
      snapshot: null,
      recentEvents: Object.freeze([]),
      synchronizing: false,
      synchronizationError: null,
    });
  }

  get state(): GameClientState {
    return this.#state;
  }

  subscribe(listener: (state: GameClientState) => void): () => void {
    this.#listeners.add(listener);
    listener(this.#state);
    return () => this.#listeners.delete(listener);
  }

  consumeSnapshot(snapshot: PlayerSnapshot): void {
    if (
      snapshot.roomId !== this.#state.roomId ||
      snapshot.playerId !== this.#state.playerId ||
      snapshot.sequence < this.#state.sequence
    ) {
      return;
    }
    this.update({
      ...this.#state,
      sequence: snapshot.sequence,
      snapshot,
      recentEvents: Object.freeze([]),
      synchronizing: false,
      synchronizationError: null,
    });
  }

  async consumeEvent(event: DomainEvent): Promise<void> {
    if (event.roomId !== this.#state.roomId) return;
    if (event.sequence <= this.#state.sequence) return;
    if (event.sequence !== this.#state.sequence + 1) {
      return this.resynchronize();
    }
    this.appendEvents([event], event.sequence);
  }

  resynchronize(): Promise<void> {
    if (this.#resynchronization) return this.#resynchronization;
    this.update({
      ...this.#state,
      synchronizing: true,
      synchronizationError: null,
    });
    const operation = this.connection
      .requestResync({
        protocolVersion: PROTOCOL_VERSION,
        roomId: this.#state.roomId,
        playerId: this.#state.playerId,
        offset: this.#state.sequence,
      })
      .then((response) => {
        if (response.status === 'snapshot') {
          this.consumeSnapshot(response.snapshot);
          return;
        }
        if (response.status === 'failed') {
          throw new Error(response.error.message);
        }
        let expected = this.#state.sequence + 1;
        for (const event of response.events) {
          if (event.sequence !== expected) {
            throw new Error('Server returned a non-contiguous event batch');
          }
          expected += 1;
        }
        this.appendEvents(response.events, response.latestSequence);
      })
      .catch((error: unknown) => {
        this.update({
          ...this.#state,
          synchronizing: false,
          synchronizationError:
            error instanceof Error ? error.message : 'Synchronization failed',
        });
      })
      .finally(() => {
        this.#resynchronization = null;
      });
    this.#resynchronization = operation;
    return operation;
  }

  private appendEvents(events: readonly DomainEvent[], sequence: number): void {
    this.update({
      ...this.#state,
      sequence,
      recentEvents: Object.freeze(
        [...this.#state.recentEvents, ...events].slice(-100),
      ),
      synchronizing: false,
      synchronizationError: null,
    });
  }

  private update(state: GameClientState): void {
    this.#state = Object.freeze(state);
    this.#listeners.forEach((listener) => listener(this.#state));
  }
}
