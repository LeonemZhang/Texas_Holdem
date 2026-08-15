import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import type { CommandResponse } from '@texas-holdem/protocol';
import { APP_VERSION } from './app-version.js';
import { PlayerSession } from './session.js';
import {
  connectSocket,
  fetchBootstrap,
  joinRoom,
  resumeRoom,
} from './socket-client.js';
import {
  buildBettingCommand,
  buildHandReadyCommand,
  buildShowHoleCardsCommand,
  type BettingAction,
} from './command-factory.js';

const MAX_COMMAND_CONFLICT_RETRIES = 2;
const DEFAULT_WAIT_TURN_TIMEOUT_MS = 30_000;
const MAX_WAIT_TURN_TIMEOUT_MS = 55_000;

export interface PokerMcpServerDependencies {
  readonly fetchBootstrap: typeof fetchBootstrap;
  readonly joinRoom: typeof joinRoom;
  readonly resumeRoom: typeof resumeRoom;
  readonly connectSocket: typeof connectSocket;
}

function summarizeSnapshot(session: PlayerSession): Record<string, unknown> {
  const snapshot = session.snapshot;
  if (!snapshot) {
    return { error: 'Not connected or no snapshot available' };
  }
  const room = snapshot.room;
  const game = snapshot.game;
  const handReady = snapshot.handReady;
  const ownPlayer = room.players.find(
    (player) => player.playerId === session.playerId,
  );
  return {
    roomId: snapshot.roomId,
    playerId: snapshot.playerId,
    sequence: snapshot.sequence,
    stateVersion: snapshot.stateVersion,
    expectedVersion: session.expectedVersion,
    phase: room.phase,
    completedHands: room.completedHands,
    handId: game?.handId ?? null,
    street: game?.street ?? null,
    myHand: game?.ownHoleCards ?? null,
    communityCards: game?.communityCards ?? [],
    totalPot: game?.totalPot ?? 0,
    myChips: ownPlayer?.chips ?? 0,
    mySeatIndex: ownPlayer?.seatIndex ?? null,
    myLobbyReady: ownPlayer?.lobbyReady ?? null,
    myStreetCommitted: ownPlayer?.streetCommitted ?? 0,
    myTotalCommitted: ownPlayer?.totalCommitted ?? 0,
    currentActorId: game?.currentActorId ?? null,
    actionDeadlineMs: game?.actionDeadlineMs ?? null,
    isMyTurn: session.isMyTurn,
    legalActions: game?.legalActions ?? null,
    handReady: handReady
      ? { deadlineMs: handReady.deadlineMs, myChoice: handReady.ownChoice }
      : null,
    players: room.players.map((p) => ({
      playerId: p.playerId,
      nickname: p.nickname,
      chips: p.chips,
      status: p.status,
      isHost: p.isHost,
      seatIndex: p.seatIndex,
      lobbyReady: p.lobbyReady,
      streetCommitted: p.streetCommitted,
      totalCommitted: p.totalCommitted,
      actionOrder: p.actionOrder ?? null,
      lastAction: p.lastAction ?? null,
    })),
    settlement: game?.settlement ?? null,
  };
}

function commandBase(session: PlayerSession) {
  return {
    protocolVersion: '3' as const,
    commandId: session.nextCommandId(),
    roomId: session.roomId ?? '',
    playerId: session.playerId ?? '',
    expectedVersion: session.expectedVersion,
  };
}

type SubmitResult = {
  readonly accepted: boolean;
  readonly status: CommandResponse['status'];
  readonly error: { code: string; message: string } | null;
  readonly stateVersion: number | null;
  readonly sequence: number | null;
  readonly currentVersion: number | null;
  readonly latestSequence: number | null;
  readonly details: Record<string, unknown>;
};

function toSubmitResult(response: CommandResponse): SubmitResult {
  const error =
    'error' in response
      ? {
          code: response.error.code,
          message: response.error.message,
        }
      : null;

  return {
    accepted: response.status === 'accepted',
    status: response.status,
    error,
    stateVersion: response.status === 'accepted' ? response.stateVersion : null,
    sequence: response.status === 'accepted' ? response.sequence : null,
    currentVersion:
      response.status === 'conflict' || response.status === 'resync-required'
        ? response.currentVersion
        : null,
    latestSequence:
      response.status === 'resync-required' ? response.latestSequence : null,
    details: 'error' in response ? (response.error.details ?? {}) : {},
  };
}

async function submitWithRetry(
  session: PlayerSession,
  command: Record<string, unknown>,
): Promise<SubmitResult> {
  let response = await session.submitCommand(command);
  let conflictRetries = 0;

  while (
    response.status === 'conflict' &&
    conflictRetries < MAX_COMMAND_CONFLICT_RETRIES
  ) {
    conflictRetries += 1;
    response = await session.submitCommand({
      ...command,
      expectedVersion: session.expectedVersion,
      commandId: session.nextCommandId(),
    });
  }

  const result = toSubmitResult(response);
  if (conflictRetries === 0) return result;
  return {
    ...result,
    details: {
      ...result.details,
      conflictRetries,
    },
  };
}

type WaitTurnResult = {
  readonly reason: string;
  readonly error: { code: string; message: string } | null;
};

function toolResult(result: Record<string, unknown>) {
  return {
    content: [
      {
        type: 'text' as const,
        text: JSON.stringify(result),
      },
    ],
  };
}

export function createPokerMcpServer(
  session: PlayerSession = new PlayerSession(),
  dependencies: Partial<PokerMcpServerDependencies> = {},
): McpServer {
  const deps: PokerMcpServerDependencies = {
    fetchBootstrap: dependencies.fetchBootstrap ?? fetchBootstrap,
    joinRoom: dependencies.joinRoom ?? joinRoom,
    resumeRoom: dependencies.resumeRoom ?? resumeRoom,
    connectSocket: dependencies.connectSocket ?? connectSocket,
  };
  const server = new McpServer({
    name: 'texas-holdem-mcp',
    version: APP_VERSION,
  });

  // poker_connect
  server.tool(
    'poker_connect',
    "Connect to a Texas Hold'em room as an AI player.",
    {
      hostUrl: z.string().url().describe('Host server URL'),
      nickname: z
        .string()
        .trim()
        .min(1)
        .max(40)
        .optional()
        .describe('Display name for a new player; optional when resuming'),
      resumeToken: z
        .object({
          roomId: z.string().min(1),
          playerId: z.string().min(1),
          token: z.string().min(16),
        })
        .optional()
        .describe('Recovery token from a previous session'),
    },
    async (input) => {
      await deps.fetchBootstrap(input.hostUrl);
      let identity: Awaited<ReturnType<typeof deps.resumeRoom>>;
      if (input.resumeToken) {
        identity = await deps.resumeRoom(
          input.hostUrl,
          input.resumeToken.roomId,
          input.resumeToken.playerId,
          input.resumeToken.token,
          input.nickname,
        );
      } else {
        if (!input.nickname) {
          throw new Error('nickname is required when joining a room');
        }
        identity = await deps.joinRoom(input.hostUrl, input.nickname);
      }
      const socket = deps.connectSocket(
        input.hostUrl,
        identity.roomId,
        identity.playerId,
        identity.sessionToken,
      );
      session.connect(socket, identity);
      try {
        const firstSnapshot = await new Promise<
          NonNullable<typeof session.snapshot>
        >((resolve, reject) => {
          let unsubSnapshot: () => void = () => {};
          let unsubDisconnect: () => void = () => {};
          const cleanup = () => {
            clearTimeout(timeout);
            unsubSnapshot();
            unsubDisconnect();
          };
          const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('Timed out waiting for initial snapshot'));
          }, 10_000);
          unsubSnapshot = session.onSnapshot((snap) => {
            cleanup();
            resolve(snap);
          });
          unsubDisconnect = session.onDisconnect(() => {
            cleanup();
            const detail = session.lastConnectError
              ? ` (${session.lastConnectError})`
              : '';
            reject(
              new Error(`Connection lost before initial snapshot${detail}`),
            );
          });
        });
        return toolResult({
          playerId: identity.playerId,
          roomId: identity.roomId,
          phase: firstSnapshot.room.phase,
          seatIndex: firstSnapshot.room.players.find(
            (p) => p.playerId === identity.playerId,
          )?.seatIndex,
          recoveryToken: {
            roomId: identity.roomId,
            playerId: identity.playerId,
            token: identity.sessionToken,
          },
        });
      } catch (error) {
        session.disconnect();
        throw error;
      }
    },
  );

  // poker_lobby_ready
  server.tool(
    'poker_lobby_ready',
    'Set your lobby-ready status before the first hand starts.',
    {},
    async () => {
      if (!session.needsLobbyReady) {
        return toolResult({
          accepted: false,
          status: 'rejected',
          error: {
            code: 'NOT_LOBBY',
            message: 'Not in lobby or already ready',
          },
        });
      }
      const command = {
        ...commandBase(session),
        type: 'room.set-lobby-ready',
        ready: true,
      };
      const result = await submitWithRetry(session, command);
      if (result.accepted && result.stateVersion !== null) {
        session.markLobbyReadyPending(result.stateVersion);
      }
      return toolResult(result);
    },
  );

  // poker_observe
  server.tool(
    'poker_observe',
    'Get the current game state snapshot for this AI player.',
    {},
    async () => toolResult(summarizeSnapshot(session)),
  );

  // poker_submit_action
  server.tool(
    'poker_submit_action',
    'Submit a betting action: fold, check, call, raise (with amount), or all-in.',
    {
      action: z.enum(['fold', 'check', 'call', 'raise', 'all-in']),
      amount: z.number().int().positive().safe().optional(),
    },
    async (input) => {
      const legal = session.legalActions;
      if (!legal) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                accepted: false,
                error: {
                  code: 'NOT_YOUR_TURN',
                  message: 'No legal actions available',
                },
              }),
            },
          ],
        };
      }
      let command: Record<string, unknown>;
      try {
        command = buildBettingCommand(
          commandBase(session),
          input.action as BettingAction,
          legal,
          input.amount,
        );
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                accepted: false,
                error: {
                  code: 'INVALID_ACTION',
                  message:
                    error instanceof Error ? error.message : 'Invalid action',
                },
              }),
            },
          ],
        };
      }
      const result = await submitWithRetry(session, command);
      return toolResult(result);
    },
  );

  // poker_submit_hand_ready
  server.tool(
    'poker_submit_hand_ready',
    'Set your hand-ready choice: ready or sitting-out.',
    { choice: z.enum(['ready', 'sitting-out']) },
    async (input) => {
      if (
        !session.snapshot?.handReady ||
        session.snapshot.room.phase !== 'hand-ready'
      ) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                accepted: false,
                error: {
                  code: 'NOT_HAND_READY',
                  message: 'Not in hand-ready phase',
                },
              }),
            },
          ],
        };
      }
      const command = buildHandReadyCommand(commandBase(session), input.choice);
      const result = await submitWithRetry(session, command);
      if (result.accepted && result.stateVersion !== null) {
        session.markHandReadyChoicePending(result.stateVersion, input.choice);
      }
      return toolResult(result);
    },
  );

  // poker_show_hole_cards
  server.tool(
    'poker_show_hole_cards',
    'Voluntarily reveal your hole cards after showdown.',
    {},
    async () => {
      const command = buildShowHoleCardsCommand(commandBase(session));
      return toolResult(await submitWithRetry(session, command));
    },
  );

  // poker_wait_turn
  server.tool(
    'poker_wait_turn',
    'Wait until it is your turn to act, hand-ready phase begins, or lobby-ready is needed.',
    {
      timeoutMs: z
        .number()
        .int()
        .positive()
        .safe()
        .max(MAX_WAIT_TURN_TIMEOUT_MS)
        .optional()
        .default(DEFAULT_WAIT_TURN_TIMEOUT_MS)
        .describe(
          `Maximum wait in milliseconds (max ${MAX_WAIT_TURN_TIMEOUT_MS}); keep the MCP callTool client timeout above this value`,
        ),
    },
    async (input) => {
      if (!session.connected) {
        const result: WaitTurnResult = {
          reason: 'error',
          error: { code: 'DISCONNECTED', message: 'Not connected' },
        };
        return toolResult(result);
      }
      if (session.isMyTurn) {
        const result: WaitTurnResult = {
          reason: 'your-turn',
          error: null,
        };
        return toolResult(result);
      }
      if (session.needsLobbyReady) {
        const result: WaitTurnResult = {
          reason: 'lobby-ready',
          error: null,
        };
        return toolResult(result);
      }
      if (session.needsHandReady) {
        const result: WaitTurnResult = {
          reason: 'hand-ready',
          error: null,
        };
        return toolResult(result);
      }
      const result = await new Promise<WaitTurnResult>((resolve) => {
        let settled = false;
        let unsubSnapshot: () => void = () => {};
        let unsubDisconnect: () => void = () => {};
        const finish = (next: WaitTurnResult) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          unsubSnapshot();
          unsubDisconnect();
          resolve(next);
        };
        unsubSnapshot = session.onSnapshot(() => {
          if (!session.connected) {
            finish({
              reason: 'error',
              error: { code: 'DISCONNECTED', message: 'Connection lost' },
            });
            return;
          }
          if (session.isMyTurn) {
            finish({ reason: 'your-turn', error: null });
            return;
          }
          if (session.needsLobbyReady) {
            finish({ reason: 'lobby-ready', error: null });
            return;
          }
          if (session.needsHandReady) {
            finish({ reason: 'hand-ready', error: null });
          }
        });
        unsubDisconnect = session.onDisconnect(() => {
          finish({
            reason: 'error',
            error: { code: 'DISCONNECTED', message: 'Connection lost' },
          });
        });
        const timeout = setTimeout(() => {
          finish({ reason: 'timeout', error: null });
        }, input.timeoutMs);
      });
      return toolResult(result);
    },
  );

  // poker_leave
  server.tool(
    'poker_leave',
    'Leave the current room and disconnect.',
    {},
    async () => {
      if (!session.connected) {
        session.disconnect();
        return toolResult({
          accepted: false,
          disconnected: true,
          error: {
            code: 'NOT_CONNECTED',
            message: 'No active room connection',
          },
        });
      }

      const result = await submitWithRetry(session, {
        ...commandBase(session),
        type: 'room.exit',
      });
      const reason = result.details.reason;
      const connectionUnavailable =
        result.status === 'unauthorized' ||
        (result.status === 'rejected' &&
          (reason === 'disconnected' ||
            reason === 'timeout' ||
            reason === 'invalid-response'));
      const shouldDisconnect =
        result.status === 'accepted' || connectionUnavailable;

      if (shouldDisconnect) session.disconnect();
      return toolResult({
        ...result,
        disconnected: shouldDisconnect,
      });
    },
  );

  return server;
}

export async function startMcpServer(): Promise<void> {
  const server = createPokerMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
