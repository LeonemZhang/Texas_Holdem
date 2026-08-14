import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RoomSettingsEditor } from './RoomSettingsEditor.js';

const settings = {
  roomName: '朋友局',
  maxPlayers: 10,
  initialChips: 100,
  smallBlind: 5,
  actionTimeoutSeconds: 30,
  handReadyTimeoutSeconds: 30,
  blindGrowth: {
    enabled: false,
    intervalHands: 10,
    mode: 'multiplier' as const,
    multiplier: 2,
    maxSmallBlind: null,
  },
  zeroChipPolicy: 'request-chips' as const,
};

describe('RoomSettingsEditor', () => {
  it('normalizes legacy values below the current small blind on open', () => {
    render(
      <RoomSettingsEditor
        settings={{
          ...settings,
          smallBlind: 10,
          blindGrowth: {
            ...settings.blindGrowth,
            enabled: true,
            mode: 'increment',
            increment: 5,
            maxSmallBlind: 2,
          },
        }}
        onSubmit={vi.fn()}
      />,
    );

    expect(screen.getByLabelText('增长步长（小盲）')).toHaveValue(10);
    expect(screen.getByLabelText('小盲上限（可选）')).toHaveValue(10);
    expect(screen.getByLabelText('大盲上限')).toHaveValue('20');
  });

  it('keeps the small and big blind controls in the small-blind grid area', () => {
    render(<RoomSettingsEditor settings={settings} onSubmit={vi.fn()} />);

    const blindPair = document.querySelector('.room-form__blind-pair');
    expect(blindPair).toBeInTheDocument();
    expect(blindPair).toHaveTextContent('小盲');
    expect(blindPair).toContainElement(
      screen.getByLabelText('大盲（小盲 × 2）'),
    );
  });

  it('keeps the current small and big blind together while editing in-game', () => {
    render(
      <RoomSettingsEditor
        settings={settings}
        currentSmallBlind={10}
        onSubmit={vi.fn()}
      />,
    );

    const blindPair = document.querySelector('.room-form__blind-pair');
    expect(blindPair).toHaveTextContent('当前小盲');
    expect(blindPair).toContainElement(
      screen.getByLabelText('当前大盲（当前小盲 × 2）'),
    );
  });

  it('submits step growth and keeps the big-blind cap in sync', () => {
    const onSubmit = vi.fn();
    render(<RoomSettingsEditor settings={settings} onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole('tab', { name: '步长增长' }));
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

    fireEvent.click(screen.getByRole('button', { name: '保存房间配置' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        blindGrowth: {
          enabled: true,
          intervalHands: 10,
          mode: 'increment',
          increment: 20,
          maxSmallBlind: 20,
        },
      }),
    );
  });

  it('normalizes below-minimum growth values when editing finishes', () => {
    render(<RoomSettingsEditor settings={settings} onSubmit={vi.fn()} />);
    fireEvent.click(screen.getByRole('tab', { name: '步长增长' }));
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

  it('links the in-game current small blind to the base blind and cap', () => {
    const onSubmit = vi.fn();
    render(
      <RoomSettingsEditor
        settings={{
          ...settings,
          blindGrowth: {
            ...settings.blindGrowth,
            enabled: true,
            maxSmallBlind: 20,
          },
        }}
        currentSmallBlind={15}
        onSubmit={onSubmit}
      />,
    );

    const currentSmallBlind = screen.getByLabelText('当前小盲');
    const maxSmallBlind = screen.getByLabelText('小盲上限（可选）');
    expect(currentSmallBlind).toHaveAttribute('min', '5');
    expect(currentSmallBlind).toHaveAttribute('max', '20');

    fireEvent.change(currentSmallBlind, { target: { value: '2' } });
    fireEvent.blur(currentSmallBlind);
    expect(currentSmallBlind).toHaveValue(5);

    fireEvent.change(currentSmallBlind, { target: { value: '15' } });
    fireEvent.blur(currentSmallBlind);
    expect(currentSmallBlind).toHaveValue(15);

    fireEvent.change(maxSmallBlind, { target: { value: '8' } });
    fireEvent.blur(maxSmallBlind);
    expect(maxSmallBlind).toHaveValue(8);
    expect(currentSmallBlind).toHaveValue(8);
    expect(currentSmallBlind).toHaveAttribute('max', '8');

    fireEvent.change(currentSmallBlind, { target: { value: '12' } });
    fireEvent.blur(currentSmallBlind);
    expect(currentSmallBlind).toHaveValue(8);

    fireEvent.click(screen.getByRole('button', { name: '保存房间配置' }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        blindGrowth: expect.objectContaining({ maxSmallBlind: 8 }),
      }),
      8,
    );
  });
});
