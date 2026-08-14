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
    const blindPair = smallBlind.closest('.room-form__blind-pair');
    expect(blindPair).toBeInTheDocument();
    expect(blindPair).toContainElement(bigBlind);

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

  it('allows multi-digit growth values to be entered above the small blind', () => {
    const onCreate = vi.fn();
    render(<CreateRoomForm onCreate={onCreate} />);
    fireEvent.click(screen.getByRole('tab', { name: '步长增长' }));
    fireEvent.change(screen.getByLabelText('小盲'), {
      target: { value: '5' },
    });
    fireEvent.change(screen.getByLabelText('增长步长（小盲）'), {
      target: { value: '2' },
    });
    fireEvent.change(screen.getByLabelText('小盲上限（可选）'), {
      target: { value: '2' },
    });

    fireEvent.change(screen.getByLabelText('增长步长（小盲）'), {
      target: { value: '20' },
    });
    fireEvent.change(screen.getByLabelText('小盲上限（可选）'), {
      target: { value: '20' },
    });
    expect(screen.getByLabelText('增长步长（小盲）')).toHaveValue(20);
    expect(screen.getByLabelText('小盲上限（可选）')).toHaveValue(20);
    expect(screen.getByLabelText('大盲上限')).toHaveValue('40');
    fireEvent.click(screen.getByRole('button', { name: '创建房间' }));

    expect(onCreate).toHaveBeenCalledWith({
      hostNickname: 'Alice',
      settings: expect.objectContaining({
        smallBlind: 5,
        blindGrowth: {
          enabled: true,
          intervalHands: 10,
          mode: 'increment',
          increment: 20,
          maxSmallBlind: 20,
        },
      }),
    });
  });

  it('normalizes below-minimum growth values when editing finishes', () => {
    render(<CreateRoomForm onCreate={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: '步长增长' }));
    fireEvent.change(screen.getByLabelText('小盲'), {
      target: { value: '5' },
    });
    const increment = screen.getByLabelText('增长步长（小盲）');
    const maxSmallBlind = screen.getByLabelText('小盲上限（可选）');

    fireEvent.change(increment, { target: { value: '2' } });
    fireEvent.change(maxSmallBlind, { target: { value: '2' } });
    expect(increment).toHaveValue(2);
    expect(maxSmallBlind).toHaveValue(2);

    fireEvent.blur(increment);
    fireEvent.blur(maxSmallBlind);
    expect(increment).toHaveValue(5);
    expect(maxSmallBlind).toHaveValue(5);
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

  it('submits the service-only Host participation choice', () => {
    const onCreate = vi.fn();
    render(<CreateRoomForm onCreate={onCreate} />);
    fireEvent.click(screen.getByLabelText('仅提供服务'));
    expect(screen.queryByLabelText('房主昵称')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '创建房间' }));
    expect(onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        hostNickname: '房主服务',
        hostParticipation: 'service-only',
      }),
    );
  });
});
