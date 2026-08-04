import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const { copyQrCodeToClipboard } = vi.hoisted(() => ({
  copyQrCodeToClipboard: vi.fn(),
}));

vi.mock('./qr-code-clipboard.js', () => ({ copyQrCodeToClipboard }));

import { CopyableQRCode } from './CopyableQRCode.js';

describe('CopyableQRCode', () => {
  it('copies the rendered QR code as an image', async () => {
    copyQrCodeToClipboard.mockResolvedValue(undefined);
    render(
      <CopyableQRCode
        value="http://10.126.126.1:32100/?room=room-1"
        size={58}
        title="加入房间二维码"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '复制二维码' }));

    await waitFor(() => expect(copyQrCodeToClipboard).toHaveBeenCalledOnce());
    expect(copyQrCodeToClipboard).toHaveBeenCalledWith(
      screen.getByTitle('加入房间二维码'),
    );
    expect(
      screen.getByRole('button', { name: '已复制二维码' }),
    ).toBeInTheDocument();
  });
});
