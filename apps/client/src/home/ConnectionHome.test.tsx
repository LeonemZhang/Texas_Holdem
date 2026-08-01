import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ConnectionHome } from './ConnectionHome.js';

const handlers = () => ({
  onCreateRoom: vi.fn(),
  onRefreshRooms: vi.fn(),
  onJoinAddress: vi.fn(),
});

describe('ConnectionHome', () => {
  it('shows create and scan only in the desktop runtime', () => {
    const desktop = handlers();
    const { rerender } = render(
      <ConnectionHome runtimeKind="desktop" {...desktop} />,
    );
    expect(
      screen.getByRole('button', { name: '创建房间' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '刷新房间' }),
    ).toBeInTheDocument();

    rerender(<ConnectionHome runtimeKind="browser" {...handlers()} />);
    expect(screen.queryByRole('button', { name: '创建房间' })).toBeNull();
    expect(screen.queryByRole('button', { name: '刷新房间' })).toBeNull();
  });

  it('normalizes a bare virtual-LAN IP before joining', () => {
    const props = handlers();
    render(<ConnectionHome runtimeKind="browser" {...props} />);
    fireEvent.change(screen.getByLabelText('房主 IP 或完整地址'), {
      target: { value: '10.126.126.1' },
    });
    fireEvent.click(screen.getByRole('button', { name: '直接加入' }));
    expect(props.onJoinAddress).toHaveBeenCalledWith(
      'http://10.126.126.1:32100/',
    );
  });

  it('keeps an invalid IP in the form and exposes an accessible error', () => {
    const props = handlers();
    render(<ConnectionHome runtimeKind="browser" {...props} />);
    fireEvent.change(screen.getByLabelText('房主 IP 或完整地址'), {
      target: { value: 'not-an-ip' },
    });
    fireEvent.click(screen.getByRole('button', { name: '直接加入' }));
    expect(screen.getByRole('alert')).toHaveTextContent('IPv4');
    expect(props.onJoinAddress).not.toHaveBeenCalled();
  });
});
