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
        blindGrowth: {
          enabled: false,
          intervalHands: 10,
          mode: 'multiplier',
          multiplier: 2,
          maxSmallBlind: null,
        },
        zeroChipPolicy: 'request-chips',
      }),
    });
  });

  it('submits a step growth and small-blind cap', () => {
    const onCreate = vi.fn();
    render(<CreateRoomForm onCreate={onCreate} />);
    fireEvent.click(screen.getByRole('tab', { name: '步长增长' }));
    fireEvent.change(screen.getByLabelText('增长步长（小盲）'), {
      target: { value: '0' },
    });
    fireEvent.change(screen.getByLabelText('小盲上限（可选）'), {
      target: { value: '0' },
    });
    expect(screen.getByLabelText('增长步长（小盲）')).toHaveValue(1);
    expect(screen.getByLabelText('小盲上限（可选）')).toHaveValue(1);
    expect(screen.getByLabelText('大盲上限')).toHaveValue('2');

    fireEvent.change(screen.getByLabelText('小盲'), {
      target: { value: '10' },
    });
    expect(screen.getByLabelText('增长步长（小盲）')).toHaveValue(10);
    expect(screen.getByLabelText('小盲上限（可选）')).toHaveValue(10);
    expect(screen.getByLabelText('大盲上限')).toHaveValue('20');

    fireEvent.change(screen.getByLabelText('增长步长（小盲）'), {
      target: { value: '5' },
    });
    fireEvent.change(screen.getByLabelText('小盲上限（可选）'), {
      target: { value: '25' },
    });
    expect(screen.getByLabelText('增长步长（小盲）')).toHaveValue(10);
    expect(screen.getByLabelText('大盲上限')).toHaveValue('50');
    fireEvent.click(screen.getByRole('button', { name: '创建房间' }));

    expect(onCreate).toHaveBeenCalledWith({
      hostNickname: 'Alice',
      settings: expect.objectContaining({
        smallBlind: 10,
        blindGrowth: {
          enabled: true,
          intervalHands: 10,
          mode: 'increment',
          increment: 10,
          maxSmallBlind: 25,
        },
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
