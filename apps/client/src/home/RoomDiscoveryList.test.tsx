import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PROTOCOL_VERSION } from '@texas-holdem/protocol';

import {
  RoomDiscoveryList,
  type RoomDiscoveryListItem,
} from './RoomDiscoveryList.js';

const room: RoomDiscoveryListItem = {
  room: {
    magic: 'TEXAS_HOLDEM_LAN_V1',
    protocolVersion: PROTOCOL_VERSION,
    requestId: 'scan-1',
    type: 'room',
    roomId: 'room-1',
    roomName: 'Friends',
    hostNickname: 'Alice',
    hostAddress: '10.126.126.1',
    httpPort: 32100,
    playerCount: 2,
    maxPlayers: 10,
    smallBlind: 1,
    bigBlind: 2,
    phase: 'lobby',
  },
  compatibility: 'compatible',
  latencyMs: 12,
  expired: false,
};

describe('RoomDiscoveryList', () => {
  it('shows public room details, latency and compatibility before joining', () => {
    const onJoin = vi.fn();
    render(
      <RoomDiscoveryList
        rooms={[room]}
        refreshing={false}
        onRefresh={vi.fn()}
        onJoin={onJoin}
      />,
    );
    expect(screen.getByText('Friends')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('2/10')).toBeInTheDocument();
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByText('12 ms')).toBeInTheDocument();
    expect(screen.getByText('可加入')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '加入' }));
    expect(onJoin).toHaveBeenCalledWith(room.room);
  });

  it('makes refresh and expired/incompatible states visible and safe', () => {
    const onRefresh = vi.fn();
    const { rerender } = render(
      <RoomDiscoveryList
        rooms={[]}
        refreshing
        onRefresh={onRefresh}
        onJoin={vi.fn()}
      />,
    );
    expect(screen.getByText('正在寻找房间…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '刷新中…' })).toBeDisabled();

    rerender(
      <RoomDiscoveryList
        rooms={[{ ...room, expired: true, compatibility: 'incompatible' }]}
        refreshing={false}
        onRefresh={onRefresh}
        onJoin={vi.fn()}
      />,
    );
    expect(screen.getByText('已过期')).toBeInTheDocument();
    expect(screen.getByText('版本不兼容')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '加入' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '刷新列表' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});
