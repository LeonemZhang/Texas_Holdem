import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RoomRecordManager } from './RoomRecordManager.js';
import type { RuntimeAdapter } from '../runtime.js';

function runtime(): RuntimeAdapter {
  return {
    getRuntimeInfo: async () => ({
      kind: 'desktop',
      appVersion: '0.0.0',
      platform: 'win32',
    }),
    listNetworkInterfaces: async () => [],
    scanLanRooms: async () => [],
    startHostService: async () => ({
      port: 32_100,
      advertisedAddress: '10.126.126.1',
      joinUrl: 'http://10.126.126.1:32100',
      dataDirectory: 'rooms',
    }),
    getActiveHostService: async () => null,
    stopHostService: async () => undefined,
    listRoomRecords: async () => [
      {
        roomId: 'room-1',
        roomName: '周末牌局',
        hostNickname: 'Alice',
        status: 'recoverable',
        createdAt: '2026-08-01T10:00:00.000Z',
        lastActiveAt: '2026-08-01T11:00:00.000Z',
        completedHands: 7,
        playerCount: 3,
      },
    ],
    recoverRoomRecord: async () => ({
      protocolVersion: '1',
      roomId: 'room-1',
      playerId: 'host',
      token: 'host-recovery-token-123456',
      joinUrl: 'http://10.126.126.1:32100/?room=room-1',
      socketPath: '/socket.io',
    }),
    archiveRoomRecord: async () => undefined,
    restoreRoomRecord: async () => undefined,
    deleteRoomRecord: async () => undefined,
    onHostServiceExited: () => () => undefined,
    setWindowRoomContext: async () => undefined,
    onPlayerExitRequested: () => () => undefined,
    onHostCloseRequested: () => () => undefined,
  };
}

describe('RoomRecordManager', () => {
  it('shows the management panel actions and localized record status', async () => {
    const onCreateRoom = vi.fn();
    const onClose = vi.fn();
    const onRecovered = vi.fn();

    render(
      <RoomRecordManager
        runtime={runtime()}
        onCreateRoom={onCreateRoom}
        onClose={onClose}
        onRecovered={onRecovered}
      />,
    );

    expect(await screen.findByText('周末牌局')).toBeInTheDocument();
    expect(screen.getByText('可恢复')).toBeInTheDocument();
    expect(screen.getByText(/3 人 · 已完成 7 手/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '创建新房间' }));
    fireEvent.click(screen.getByRole('button', { name: '返回首页' }));
    expect(onCreateRoom).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('opens the recovered host session instead of leaving the host in records', async () => {
    const onRecovered = vi.fn();
    render(
      <RoomRecordManager
        runtime={runtime()}
        onCreateRoom={vi.fn()}
        onClose={vi.fn()}
        onRecovered={onRecovered}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: '恢复对局' }));

    await waitFor(() =>
      expect(onRecovered).toHaveBeenCalledWith(
        expect.objectContaining({ roomId: 'room-1', playerId: 'host' }),
      ),
    );
  });

  it('requires a second confirmation before deleting an archived record', async () => {
    const deleteRoomRecord = vi.fn(async () => undefined);
    const archivedRuntime: RuntimeAdapter = {
      ...runtime(),
      listRoomRecords: async (includeArchived) =>
        includeArchived
          ? [
              {
                roomId: 'archived-room',
                roomName: '旧对局',
                hostNickname: 'Alice',
                status: 'archived',
                createdAt: '2026-08-01T10:00:00.000Z',
                lastActiveAt: '2026-08-01T11:00:00.000Z',
                completedHands: 7,
                playerCount: 3,
              },
            ]
          : [],
      deleteRoomRecord,
    };
    render(
      <RoomRecordManager
        runtime={archivedRuntime}
        onCreateRoom={vi.fn()}
        onClose={vi.fn()}
        onRecovered={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByLabelText('显示已归档对局'));
    fireEvent.click(await screen.findByRole('button', { name: '删除记录' }));

    const confirmation = screen.getByRole('alertdialog', {
      name: '确认删除对局记录',
    });
    expect(confirmation).toHaveTextContent('旧对局');
    expect(confirmation).toHaveTextContent('删除后不可恢复。');
    expect(deleteRoomRecord).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '确认删除' }));
    await waitFor(() =>
      expect(deleteRoomRecord).toHaveBeenCalledWith('archived-room'),
    );
  });
});
