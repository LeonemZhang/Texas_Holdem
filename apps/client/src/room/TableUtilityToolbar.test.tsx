import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TableUtilityToolbar } from './TableUtilityToolbar.js';

describe('TableUtilityToolbar', () => {
  it('renders the normal-player tools followed by the exit action', () => {
    const onOpenPanel = vi.fn();
    render(
      <TableUtilityToolbar
        activePanel={null}
        isHost={false}
        onOpenPanel={onOpenPanel}
        onExitRoom={vi.fn()}
      />,
    );

    expect(
      screen.getAllByRole('button').map((button) => button.textContent),
    ).toEqual(['筹码交换', '查看统计', '×']);

    fireEvent.click(screen.getByRole('button', { name: '筹码交换' }));
    expect(onOpenPanel).toHaveBeenCalledWith(
      'chip-exchange',
      expect.any(HTMLButtonElement),
    );
  });

  it('shows host management without rendering a host exit action', () => {
    render(
      <TableUtilityToolbar activePanel="host" isHost onOpenPanel={vi.fn()} />,
    );

    expect(
      screen.getAllByRole('button').map((button) => button.textContent),
    ).toEqual(['筹码交换', '房主管理', '查看统计']);
    expect(screen.getByRole('button', { name: '房主管理' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });
});
