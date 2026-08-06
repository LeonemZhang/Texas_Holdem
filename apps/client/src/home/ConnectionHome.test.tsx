import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConnectionHome } from './ConnectionHome.js';

const handlers = () => ({
  onCreateRoom: vi.fn(),
  onRefreshRooms: vi.fn(),
  joinReady: false,
  onProbeAddress: vi.fn().mockResolvedValue(true),
  onResetProbe: vi.fn(),
  onJoin: vi.fn(),
});

describe('ConnectionHome', () => {
  it('shows create and scan only in the desktop runtime', () => {
    const desktop = handlers();
    const { rerender } = render(
      <ConnectionHome runtimeKind="desktop" {...desktop} />,
    );
    expect(
      screen.getByRole('button', { name: '创建牌局' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '扫描牌桌' }),
    ).toBeInTheDocument();

    rerender(<ConnectionHome runtimeKind="browser" {...handlers()} />);
    expect(screen.queryByRole('button', { name: '创建牌局' })).toBeNull();
    expect(screen.queryByRole('button', { name: '扫描牌桌' })).toBeNull();
  });

  it('normalizes a bare virtual-LAN IP before probing the room', async () => {
    const props = handlers();
    render(<ConnectionHome runtimeKind="browser" {...props} />);
    fireEvent.change(screen.getByLabelText('IP 直连到房主牌桌'), {
      target: { value: '10.126.126.1' },
    });
    fireEvent.click(screen.getByRole('button', { name: '检测房间' }));
    await waitFor(() =>
      expect(props.onProbeAddress).toHaveBeenCalledWith(
        'http://10.126.126.1:32100/',
      ),
    );
  });

  it('prefills the host address from an invitation link', () => {
    render(
      <ConnectionHome
        runtimeKind="browser"
        initialAddress="10.126.126.1:32100"
        {...handlers()}
      />,
    );

    expect(screen.getByLabelText('IP 直连到房主牌桌')).toHaveValue(
      '10.126.126.1:32100',
    );
  });

  it('keeps an invalid IP in the form and exposes an accessible error', () => {
    const props = handlers();
    render(<ConnectionHome runtimeKind="browser" {...props} />);
    fireEvent.change(screen.getByLabelText('IP 直连到房主牌桌'), {
      target: { value: 'not-an-ip' },
    });
    fireEvent.click(screen.getByRole('button', { name: '检测房间' }));
    expect(screen.getByRole('alert')).toHaveTextContent('IPv4');
    expect(props.onProbeAddress).not.toHaveBeenCalled();
  });

  it('shows a Chinese error when the host address is empty', () => {
    const props = handlers();
    render(<ConnectionHome runtimeKind="browser" {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '检测房间' }));
    expect(screen.getByRole('alert')).toHaveTextContent('请输入房主 IP 地址');
    expect(props.onProbeAddress).not.toHaveBeenCalled();
  });

  it('reveals nickname confirmation only after a room was detected', () => {
    const props = { ...handlers(), joinReady: true };
    render(<ConnectionHome runtimeKind="browser" {...props} />);
    expect(screen.getByText('牌桌连接正常')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '确认加入' }));
    expect(props.onJoin).toHaveBeenCalledWith('Bob');
  });

  it('shows the original nickname when a lobby recovery is waiting for confirmation', () => {
    const props = {
      ...handlers(),
      joinReady: true,
      initialNickname: 'Alice',
      resumeNicknameChange: true,
    };
    render(<ConnectionHome runtimeKind="browser" {...props} />);

    expect(screen.getByText('恢复原身份')).toBeInTheDocument();
    expect(screen.getByLabelText('玩家昵称')).toHaveValue('Alice');
    fireEvent.click(screen.getByRole('button', { name: '确认恢复' }));
    expect(props.onJoin).toHaveBeenCalledWith('Alice');
  });

  it('shows a running local room above direct joining and delegates recovery', () => {
    const props = {
      ...handlers(),
      runningRoomRecord: {
        roomId: 'running-room',
        roomName: '周末牌局',
        hostNickname: 'Alice',
        status: 'running' as const,
        createdAt: '2026-08-03T10:00:00.000Z',
        lastActiveAt: '2026-08-03T11:00:00.000Z',
        completedHands: 7,
        playerCount: 3,
      },
      onRecoverRunningRoom: vi.fn(),
    };

    render(<ConnectionHome runtimeKind="desktop" {...props} />);

    const runningRoomTitle = screen.getByRole('heading', {
      name: '继续“周末牌局”',
    });
    expect(runningRoomTitle).toBeInTheDocument();
    expect(screen.getByText('进行中')).toBeInTheDocument();
    expect(
      runningRoomTitle.compareDocumentPosition(
        screen.getByLabelText('IP 直连到房主牌桌'),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '恢复对局' }));
    expect(props.onRecoverRunningRoom).toHaveBeenCalledOnce();
  });

  it('keeps a recovery failure beside the running-room action', () => {
    render(
      <ConnectionHome
        runtimeKind="desktop"
        runningRoomRecord={{
          roomId: 'running-room',
          roomName: '周末牌局',
          hostNickname: 'Alice',
          status: 'running',
          createdAt: '2026-08-03T10:00:00.000Z',
          lastActiveAt: '2026-08-03T11:00:00.000Z',
          completedHands: 7,
          playerCount: 3,
        }}
        runningRoomRecoveryError="恢复对局失败，请重试。"
        {...handlers()}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      '恢复对局失败，请重试。',
    );
  });
});
