import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CreateRoomForm } from './CreateRoomForm.js';

describe('CreateRoomForm', () => {
  it('starts at the 1/2 blind tier and keeps the big blind read-only at twice small blind', () => {
    render(<CreateRoomForm onCreate={vi.fn()} />);
    const smallBlind = screen.getByLabelText('小盲');
    const bigBlind = screen.getByLabelText('大盲（小盲 × 2）');
    expect(smallBlind).toHaveValue('1');
    expect(bigBlind).toHaveValue('2');
    expect(bigBlind).toHaveAttribute('readonly');

    fireEvent.change(smallBlind, { target: { value: '5' } });
    expect(bigBlind).toHaveValue('10');
  });

  it('submits 100 initial chips with blind growth disabled by default', () => {
    const onCreate = vi.fn();
    render(<CreateRoomForm onCreate={onCreate} />);
    fireEvent.click(screen.getByRole('button', { name: '创建房间' }));
    expect(onCreate).toHaveBeenCalledWith({
      hostNickname: 'Alice',
      settings: expect.objectContaining({
        maxPlayers: 10,
        initialChips: 100,
        smallBlind: 1,
        blindGrowth: { enabled: false, intervalHands: 10, multiplier: 2 },
        zeroChipPolicy: 'request-chips',
      }),
    });
  });

  it('uses shared schema validation and does not submit invalid chip amounts', () => {
    const onCreate = vi.fn();
    render(<CreateRoomForm onCreate={onCreate} />);
    fireEvent.change(screen.getByLabelText('初始筹码'), {
      target: { value: '0' },
    });
    fireEvent.click(screen.getByRole('button', { name: '创建房间' }));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(onCreate).not.toHaveBeenCalled();
  });
});
