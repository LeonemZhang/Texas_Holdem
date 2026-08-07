import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DiscoveryJoinDialog } from './DiscoveryJoinDialog.js';

describe('DiscoveryJoinDialog', () => {
  it('asks for a nickname and submits the trimmed value', () => {
    const onConfirm = vi.fn();

    render(
      <DiscoveryJoinDialog
        roomName="周末牌局"
        joining={false}
        error={null}
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(
      screen.getByRole('dialog', { name: '加入“周末牌局”' }),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('玩家昵称'), {
      target: { value: '  Carol  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: '确定加入' }));

    expect(onConfirm).toHaveBeenCalledWith('Carol');
  });

  it('keeps confirmation disabled while joining and exposes a join error', () => {
    render(
      <DiscoveryJoinDialog
        roomName="周末牌局"
        joining
        error="该昵称已被房间中的其他玩家使用，请更换昵称。"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: '正在加入…' })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      '该昵称已被房间中的其他玩家使用，请更换昵称。',
    );
  });

  it('prefills the original nickname for a lobby identity that can be renamed', () => {
    render(
      <DiscoveryJoinDialog
        roomName="周末牌局"
        initialNickname="Alice"
        resumeNicknameChange
        joining={false}
        error={null}
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(
      screen.getByText('使用原令牌恢复，可在这里修改昵称。'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('玩家昵称')).toHaveValue('Alice');
  });
});
