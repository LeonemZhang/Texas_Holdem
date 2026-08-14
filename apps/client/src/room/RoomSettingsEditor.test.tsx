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
});
