import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
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
    openRoomRecordManager: async () => undefined,
    listNetworkInterfaces: async () => [
      {
        name: 'Virtual LAN',
        address: '10.126.126.1',
        netmask: '255.255.255.0',
        mac: '00:11:22:33:44:55',
      },
    ],
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
        network: { name: 'Virtual LAN', address: '10.126.126.1' },
      },
    ],
    recoverRoomRecord: async () => ({
      protocolVersion: '3',
      roomId: 'room-1',
      playerId: 'host',
      token: 'host-recovery-token-123456',
      joinUrl: 'http://10.126.126.1:32100/?room=room-1',
      socketPath: '/socket.io',
    }),
    closeRunningRoomRecord: async () => undefined,
    archiveRoomRecord: async () => undefined,
    restoreRoomRecord: async () => undefined,
    deleteRoomRecord: async () => undefined,
    getRoomRecordStatistics: async () => ({
      players: [
        {
          playerId: 'host',
          nickname: 'Alice',
          initialChips: 1_000,
          currentChips: 1_200,
          netWinLoss: 200,
          participatedHands: 7,
          wonHands: 3,
          largestSingleHandProfit: 250,
          largestSingleHandLoss: 400,
          showdownCount: 3,
          showdownWinRate: 2 / 3,
          actions: { fold: 1, check: 2, call: 3, raiseTo: 1, allIn: 0 },
        },
      ],
      titles: [],
      handPeaks: { global: null, players: [], hasLegacyCoverageGap: false },
    }),
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
    const recoverButton = screen.getByRole('button', { name: '恢复对局' });
    const statisticsButton = screen.getByRole('button', { name: '查看统计' });
    expect(
      recoverButton.compareDocumentPosition(statisticsButton) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(
      screen.getByText(/联机网卡：Virtual LAN · 10.126.126.1/),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '创建新房间' }));
    fireEvent.click(screen.getByRole('button', { name: '返回首页' }));
    expect(onCreateRoom).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('opens the same statistics report in a modal from every record row', async () => {
    render(
      <RoomRecordManager
        runtime={runtime()}
        onCreateRoom={vi.fn()}
        onClose={vi.fn()}
        onRecovered={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: '查看统计' }));
    expect(
      await screen.findByRole('heading', { name: '牌局战报' }),
    ).toBeInTheDocument();
    expect(screen.getByText('周末牌局')).toBeInTheDocument();
  });

  it('keeps a removed player at the end of historical statistics', async () => {
    const recordRuntime = runtime();
    recordRuntime.getRoomRecordStatistics = async () => ({
      players: [
        {
          playerId: 'host',
          nickname: 'Alice',
          initialChips: 1_000,
          currentChips: 800,
          netWinLoss: -200,
          participatedHands: 7,
          wonHands: 2,
          largestSingleHandProfit: 250,
          largestSingleHandLoss: 400,
          showdownCount: 3,
          showdownWinRate: 2 / 3,
          actions: { fold: 1, check: 2, call: 3, raiseTo: 1, allIn: 0 },
        },
        {
          playerId: 'bob',
          nickname: 'Bob',
          removed: true,
          initialChips: 1_000,
          currentChips: 1_200,
          netWinLoss: 200,
          participatedHands: 7,
          wonHands: 3,
          largestSingleHandProfit: 250,
          largestSingleHandLoss: 400,
          showdownCount: 3,
          showdownWinRate: 2 / 3,
          actions: { fold: 1, check: 2, call: 3, raiseTo: 1, allIn: 0 },
        },
      ],
      titles: [],
      handPeaks: { global: null, players: [], hasLegacyCoverageGap: false },
    });

    render(
      <RoomRecordManager
        runtime={recordRuntime}
        onCreateRoom={vi.fn()}
        onClose={vi.fn()}
        onRecovered={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: '查看统计' }));

    const rows = within(
      await screen.findByRole('tabpanel', { name: '牌局统计' }),
    ).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('#1 Alice');
    expect(rows[1]).toHaveTextContent('#2 Bob');
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

  it('opens a one-time network choice before recovering a legacy record', async () => {
    const recoverRoomRecord = vi.fn().mockResolvedValueOnce({
      protocolVersion: '3' as const,
      roomId: 'room-1',
      playerId: 'host',
      token: 'host-recovery-token-123456',
      joinUrl: 'http://192.168.1.8:32100/?room=room-1',
      socketPath: '/socket.io' as const,
    });
    const fallbackRuntime: RuntimeAdapter = {
      ...runtime(),
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
          network: null,
        },
      ],
      listNetworkInterfaces: async () => [
        {
          name: 'Home LAN',
          address: '192.168.1.8',
          netmask: '255.255.255.0',
          mac: '00:11:22:33:44:55',
        },
      ],
      recoverRoomRecord,
    };
    const onRecovered = vi.fn();
    render(
      <RoomRecordManager
        runtime={fallbackRuntime}
        onCreateRoom={vi.fn()}
        onClose={vi.fn()}
        onRecovered={onRecovered}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: '恢复对局' }));
    expect(
      await screen.findByRole('alertdialog', { name: '选择恢复网卡' }),
    ).toBeInTheDocument();
    expect(recoverRoomRecord).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '使用此网卡恢复' }));

    await waitFor(() =>
      expect(recoverRoomRecord).toHaveBeenLastCalledWith({
        roomId: 'room-1',
        network: { name: 'Home LAN', address: '192.168.1.8' },
      }),
    );
    expect(onRecovered).toHaveBeenCalledOnce();
  });

  it('requires choosing recovery or normal closure before replacing a running room', async () => {
    const closeRunningRoomRecord = vi.fn(async () => undefined);
    const stopHostService = vi.fn(async () => undefined);
    const onCreateRoom = vi.fn();
    const onRecovered = vi.fn();
    const runningRuntime: RuntimeAdapter = {
      ...runtime(),
      listRoomRecords: async () => [
        {
          roomId: 'room-1',
          roomName: '周末牌局',
          hostNickname: 'Alice',
          status: 'running',
          createdAt: '2026-08-01T10:00:00.000Z',
          lastActiveAt: '2026-08-01T11:00:00.000Z',
          completedHands: 7,
          playerCount: 3,
        },
      ],
      closeRunningRoomRecord,
      stopHostService,
    };
    render(
      <RoomRecordManager
        runtime={runningRuntime}
        onCreateRoom={onCreateRoom}
        onClose={vi.fn()}
        onRecovered={onRecovered}
      />,
    );

    expect(
      await screen.findByRole('button', { name: '恢复对局' }),
    ).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: '创建新房间' }));
    expect(
      screen.getByRole('alertdialog', { name: '确认替换进行中对局' }),
    ).toHaveTextContent('周末牌局');
    expect(onCreateRoom).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '恢复上次对局' }));
    await waitFor(() => expect(onRecovered).toHaveBeenCalledOnce());
    expect(closeRunningRoomRecord).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: '创建新房间' }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: '关闭上次对局并重新选择网卡',
      }),
    );
    await waitFor(() =>
      expect(closeRunningRoomRecord).toHaveBeenCalledWith('room-1'),
    );
    expect(stopHostService).toHaveBeenCalledOnce();
    expect(onCreateRoom).toHaveBeenCalledWith(true);
  });

  it('keeps the replacement choice open when stopping the host fails', async () => {
    const stopHostService = vi.fn(async () => {
      throw new Error('Unable to stop host service');
    });
    const runningRuntime: RuntimeAdapter = {
      ...runtime(),
      listRoomRecords: async () => [
        {
          roomId: 'room-1',
          roomName: '周末牌局',
          hostNickname: 'Alice',
          status: 'running',
          createdAt: '2026-08-01T10:00:00.000Z',
          lastActiveAt: '2026-08-01T11:00:00.000Z',
          completedHands: 7,
          playerCount: 3,
        },
      ],
      stopHostService,
    };
    const onCreateRoom = vi.fn();
    render(
      <RoomRecordManager
        runtime={runningRuntime}
        onCreateRoom={onCreateRoom}
        onClose={vi.fn()}
        onRecovered={vi.fn()}
      />,
    );

    fireEvent.click(await screen.findByRole('button', { name: '创建新房间' }));
    fireEvent.click(
      await screen.findByRole('button', {
        name: '关闭上次对局并重新选择网卡',
      }),
    );

    expect(
      await screen.findByText('关闭进行中对局或停止房主服务失败，请重试。'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('alertdialog', { name: '确认替换进行中对局' }),
    ).toBeInTheDocument();
    expect(onCreateRoom).not.toHaveBeenCalled();
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
