import {
  CommandResponseSchema,
  PROTOCOL_VERSION,
  PlayerSnapshotSchema,
  type CommandResponse,
  type LegalActions,
  type PlayerSnapshot,
} from '@texas-holdem/protocol';
import { randomUUID } from 'node:crypto';
import { type Socket } from 'socket.io-client';

export const DEFAULT_COMMAND_TIMEOUT_MS = 10_000;

export type ConnectionState =
  'disconnected' | 'connecting' | 'connected' | 'left';

export interface SessionIdentity {
  readonly roomId: string;
  readonly playerId: string;
  readonly sessionToken: string;
}

interface PendingCommand {
  readonly commandId: unknown;
  readonly timer: NodeJS.Timeout;
  readonly settle: (response: CommandResponse) => void;
}

type CommandFailureReason = 'timeout' | 'disconnected' | 'invalid-response';

function rejectedCommandResponse(
  commandId: unknown,
  message: string,
  reason: CommandFailureReason,
): CommandResponse {
  return {
    protocolVersion: PROTOCOL_VERSION,
    commandId:
      typeof commandId === 'string' && commandId.trim()
        ? commandId
        : 'unknown-command',
    status: 'rejected',
    error: {
      code: 'INTERNAL_ERROR',
      message,
      details: { reason },
    },
  };
}

export class PlayerSession {
  private _state: ConnectionState = 'disconnected';
  private _snapshot: PlayerSnapshot | null = null;
  private _expectedVersion = 0;
  private _lastSequence = -1;
  private _lobbyReadyPendingVersion: number | null = null;
  private _handReadyChoicePendingVersion: number | null = null;
  private _acknowledgedHandReadyKey: string | null = null;
  private _acknowledgedHandReadyChoice: 'ready' | 'sitting-out' | null = null;
  private _socket: Socket | null = null;
  private _identity: SessionIdentity | null = null;
  private _lastConnectError: string | null = null;
  private _sequenceCounter = 0;
  private readonly _pendingCommands = new Set<PendingCommand>();

  /** Handlers called when a new snapshot arrives. */
  private snapshotListeners: Array<(snapshot: PlayerSnapshot) => void> = [];
  /** Handlers called when the Socket.IO connection becomes unavailable. */
  private disconnectListeners: Array<() => void> = [];

  get state(): ConnectionState {
    return this._state;
  }

  get snapshot(): PlayerSnapshot | null {
    return this._snapshot;
  }

  get expectedVersion(): number {
    return this._expectedVersion;
  }

  get lastSequence(): number | null {
    return this._lastSequence >= 0 ? this._lastSequence : null;
  }

  get lobbyReadyPendingVersion(): number | null {
    return this._lobbyReadyPendingVersion;
  }

  get identity(): SessionIdentity | null {
    return this._identity;
  }

  get playerId(): string | null {
    return this._identity?.playerId ?? null;
  }

  get roomId(): string | null {
    return this._identity?.roomId ?? null;
  }

  get connected(): boolean {
    return this._state === 'connected' && this._socket?.connected === true;
  }

  /** Last Socket.IO connect_error message, or null when connected. */
  get lastConnectError(): string | null {
    return this._lastConnectError;
  }

  onSnapshot(fn: (snapshot: PlayerSnapshot) => void): () => void {
    this.snapshotListeners.push(fn);
    return () => {
      this.snapshotListeners = this.snapshotListeners.filter(
        (listener) => listener !== fn,
      );
    };
  }

  onDisconnect(fn: () => void): () => void {
    this.disconnectListeners.push(fn);
    return () => {
      this.disconnectListeners = this.disconnectListeners.filter(
        (listener) => listener !== fn,
      );
    };
  }

  connect(socket: Socket, identity: SessionIdentity): void {
    this.failPendingCommands(
      'A new session replaced the connection before command acknowledgment',
      'disconnected',
    );
    if (this._socket && this._socket !== socket) {
      this._socket.removeAllListeners();
      this._socket.disconnect();
    }
    this._state = 'connecting';
    this._socket = socket;
    this._identity = identity;
    this._snapshot = null;
    this._expectedVersion = 0;
    this._lastSequence = -1;
    this._lobbyReadyPendingVersion = null;
    this._handReadyChoicePendingVersion = null;
    this._acknowledgedHandReadyKey = null;
    this._acknowledgedHandReadyChoice = null;
    this._lastConnectError = null;

    socket.on('connect', () => {
      this._state = 'connected';
      this._lastConnectError = null;
    });

    socket.on('connect_error', (error: unknown) => {
      this._lastConnectError =
        error instanceof Error ? error.message : String(error);
    });

    socket.on('state:snapshot', (raw: unknown) => {
      const parsed = PlayerSnapshotSchema.safeParse(raw);
      if (!parsed.success) return;
      if (parsed.data.sequence < this._lastSequence) return;

      this._snapshot = parsed.data;
      this._lastSequence = parsed.data.sequence;
      this._expectedVersion = parsed.data.stateVersion;
      if (
        this._lobbyReadyPendingVersion !== null &&
        parsed.data.stateVersion >= this._lobbyReadyPendingVersion
      ) {
        this._lobbyReadyPendingVersion = null;
      }
      if (
        this._handReadyChoicePendingVersion !== null &&
        parsed.data.stateVersion >= this._handReadyChoicePendingVersion
      ) {
        this._handReadyChoicePendingVersion = null;
      }
      for (const listener of this.snapshotListeners) {
        listener(parsed.data);
      }
    });

    socket.on('disconnect', () => {
      this._state = 'disconnected';
      this.failPendingCommands(
        'Connection lost before command acknowledgment',
        'disconnected',
      );
      this.notifyDisconnected();
    });
  }

  submitCommand(
    command: Record<string, unknown>,
    timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
  ): Promise<CommandResponse> {
    if (!this._socket || !this.connected) {
      return Promise.resolve(
        rejectedCommandResponse(
          command.commandId,
          'Not connected',
          'disconnected',
        ),
      );
    }
    const socket = this._socket;

    const commandId = command.commandId;
    const effectiveTimeout =
      Number.isSafeInteger(timeoutMs) && timeoutMs > 0
        ? timeoutMs
        : DEFAULT_COMMAND_TIMEOUT_MS;

    return new Promise((resolve) => {
      let settled = false;
      const pending: PendingCommand = {
        commandId,
        timer: setTimeout(() => {
          pending.settle(
            rejectedCommandResponse(
              commandId,
              `Timed out after ${effectiveTimeout}ms waiting for command acknowledgment`,
              'timeout',
            ),
          );
        }, effectiveTimeout),
        settle: (response) => {
          if (settled) return;
          settled = true;
          clearTimeout(pending.timer);
          this._pendingCommands.delete(pending);
          resolve(response);
        },
      };

      this._pendingCommands.add(pending);
      try {
        socket.emit('command:submit', command, (rawResponse: unknown) => {
          const response = CommandResponseSchema.safeParse(rawResponse);
          if (!response.success) {
            pending.settle(
              rejectedCommandResponse(
                commandId,
                'Host returned an invalid command response',
                'invalid-response',
              ),
            );
            return;
          }
          if (response.data.status === 'accepted') {
            this._expectedVersion = response.data.stateVersion;
            this._lastSequence = Math.max(
              this._lastSequence,
              response.data.sequence,
            );
          } else if (response.data.status === 'conflict') {
            this._expectedVersion = response.data.currentVersion;
          }
          pending.settle(response.data);
        });
      } catch {
        pending.settle(
          rejectedCommandResponse(
            commandId,
            'Socket could not submit the command',
            'disconnected',
          ),
        );
      }
    });
  }

  setExpectedVersion(version: number): void {
    if (!Number.isSafeInteger(version) || version < 0) {
      throw new RangeError('Expected version must be a non-negative integer');
    }
    this._expectedVersion = version;
  }

  markLobbyReadyPending(stateVersion: number): void {
    if (!Number.isSafeInteger(stateVersion) || stateVersion < 0) {
      throw new RangeError('State version must be a non-negative integer');
    }
    this._lobbyReadyPendingVersion = Math.max(
      this._lobbyReadyPendingVersion ?? -1,
      stateVersion,
    );
  }

  markHandReadyChoicePending(
    stateVersion: number,
    choice: 'ready' | 'sitting-out',
  ): void {
    if (!Number.isSafeInteger(stateVersion) || stateVersion < 0) {
      throw new RangeError('State version must be a non-negative integer');
    }
    this._handReadyChoicePendingVersion = Math.max(
      this._handReadyChoicePendingVersion ?? -1,
      stateVersion,
    );
    const key = this.handReadyKey;
    if (key !== null) {
      this._acknowledgedHandReadyKey = key;
      this._acknowledgedHandReadyChoice = choice;
    }
  }

  clearLobbyReadyPending(): void {
    this._lobbyReadyPendingVersion = null;
  }

  /** Host idempotency is keyed by playerId + commandId, including across resume processes. */
  nextCommandId(): string {
    this._sequenceCounter += 1;
    return `cmd-${randomUUID()}-${this._sequenceCounter}`;
  }

  disconnect(): void {
    this.failPendingCommands(
      'Session disconnected before command acknowledgment',
      'disconnected',
    );
    if (this._socket) {
      this._socket.removeAllListeners();
      this._socket.disconnect();
      this._socket = null;
    }
    this._state = 'left';
    this._snapshot = null;
    this._expectedVersion = 0;
    this._lastSequence = -1;
    this._lobbyReadyPendingVersion = null;
    this._handReadyChoicePendingVersion = null;
    this._acknowledgedHandReadyKey = null;
    this._acknowledgedHandReadyChoice = null;
    this._identity = null;
    this._lastConnectError = null;
    this.snapshotListeners = [];
    this.disconnectListeners = [];
    this._pendingCommands.clear();
  }

  /** Extract current legal actions from snapshot. */
  get legalActions(): LegalActions | null {
    return this._snapshot?.game?.legalActions ?? null;
  }

  /** Whether it's currently this player's turn to act. */
  get isMyTurn(): boolean {
    if (!this._snapshot?.game) return false;
    return this._snapshot.game.currentActorId === this._identity?.playerId;
  }

  /** Whether this player is in hand-ready phase and needs to choose. */
  get needsHandReady(): boolean {
    if (!this._snapshot?.handReady) return false;
    if (this._handReadyChoicePendingVersion !== null) return false;

    const choice = this._snapshot.handReady.ownChoice;
    if (choice === 'pending') return true;
    if (choice === 'ready') return false;

    const key = this.handReadyKey;
    return (
      key !== this._acknowledgedHandReadyKey ||
      this._acknowledgedHandReadyChoice !== choice
    );
  }

  /** Snapshot key identifying one inter-hand preparation window. */
  private get handReadyKey(): string | null {
    const ready = this._snapshot?.handReady;
    if (!ready) return null;
    return `${this._snapshot?.game?.handId ?? 'hand-ready'}:${ready.deadlineMs}`;
  }

  /** Whether this player is in lobby and hasn't set ready yet. */
  get needsLobbyReady(): boolean {
    if (!this._snapshot) return false;
    if (this._lobbyReadyPendingVersion !== null) return false;

    const room = this._snapshot.room;
    if (room.phase !== 'lobby') return false;
    const player = room.players.find(
      (candidate) => candidate.playerId === this._identity?.playerId,
    );
    return (
      player != null &&
      !['left', 'removed'].includes(player.status) &&
      player.lobbyReady !== true
    );
  }

  private failPendingCommands(
    message: string,
    reason: CommandFailureReason,
  ): void {
    for (const pending of [...this._pendingCommands]) {
      pending.settle(
        rejectedCommandResponse(pending.commandId, message, reason),
      );
    }
  }

  private notifyDisconnected(): void {
    for (const listener of [...this.disconnectListeners]) {
      listener();
    }
  }
}
