import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PROTOCOL_VERSION, type PlayerSnapshot } from '@texas-holdem/protocol';

import type { ConnectionAdapter } from '../connection/connection.js';
import { GameRoom } from './GameRoom.js';

const snapshot: PlayerSnapshot = {
  protocolVersion: PROTOCOL_VERSION,
  roomId: 'room-1',
  playerId: 'bob',
  sequence: 2,
  stateVersion: 2,
  room: {
    roomName: 'Friends',
    phase: 'lobby',
    smallBlind: 1,
    bigBlind: 2,
    completedHands: 0,
    players: [
      {
        playerId: 'host',
        nickname: 'Alice',
        seatIndex: 0,
        chips: 100,
        status: 'waiting',
        isHost: true,
        lobbyReady: true,
      },
      {
        playerId: 'bob',
        nickname: 'Bob',
        seatIndex: 1,
        chips: 100,
        status: 'waiting',
        isHost: false,
        lobbyReady: false,
      },
    ],
  },
  game: null,
  handReady: null,
  statistics: { players: [], titles: [] },
};

describe('GameRoom', () => {
  it('renders the authoritative lobby snapshot and sends ready with its version', async () => {
    let consumeSnapshot: (value: PlayerSnapshot) => void = () => undefined;
    const sendCommand = vi.fn().mockResolvedValue({
      protocolVersion: PROTOCOL_VERSION,
      commandId: 'command-1',
      status: 'accepted',
      stateVersion: 3,
      sequence: 3,
    });
    const connection: ConnectionAdapter = {
      connect: vi.fn(async () => consumeSnapshot(snapshot)),
      disconnect: vi.fn(),
      sendCommand,
      requestResync: vi.fn(),
      onConnectionLost: vi.fn(() => () => undefined),
      onDomainEvent: vi.fn(() => () => undefined),
      onSnapshot: vi.fn((listener) => {
        consumeSnapshot = listener;
        return () => undefined;
      }),
    };
    render(
      <GameRoom
        session={{
          protocolVersion: PROTOCOL_VERSION,
          roomId: 'room-1',
          playerId: 'bob',
          token: 'bob-reconnect-token-123456',
          joinUrl: 'http://10.126.126.1:32100/?room=room-1',
          socketPath: '/socket.io',
        }}
        connectionFactory={() => connection}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: '准备' }));
    await waitFor(() =>
      expect(sendCommand).toHaveBeenCalledWith(
        expect.objectContaining({
          roomId: 'room-1',
          playerId: 'bob',
          expectedVersion: 2,
          type: 'room.set-lobby-ready',
          ready: true,
        }),
      ),
    );
  });
});
