import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ModalDialog } from './ModalDialog.js';

describe('ModalDialog', () => {
  it('keeps cancel and confirm actions in stable columns without a secondary action', () => {
    render(
      <ModalDialog
        title="确认操作"
        confirmAction={{ label: '确认执行', onClick: vi.fn() }}
        onCancel={vi.fn()}
      >
        <p>操作说明</p>
      </ModalDialog>,
    );

    expect(screen.getByRole('button', { name: '取消' })).toHaveClass(
      'modal-dialog__cancel',
    );
    expect(screen.getByRole('button', { name: '确认执行' })).toHaveClass(
      'modal-dialog__confirm',
    );
    expect(document.querySelector('.modal-dialog__spacer')).toHaveAttribute(
      'aria-hidden',
      'true',
    );
  });

  it('places an optional secondary action in its dedicated slot', () => {
    render(
      <ModalDialog
        title="确认操作"
        secondaryAction={{ label: '其他操作', onClick: vi.fn() }}
        confirmAction={{ label: '确认', onClick: vi.fn() }}
        onCancel={vi.fn()}
      >
        <p>操作说明</p>
      </ModalDialog>,
    );

    expect(screen.getByRole('button', { name: '其他操作' })).toHaveClass(
      'modal-dialog__secondary',
    );
  });
});
