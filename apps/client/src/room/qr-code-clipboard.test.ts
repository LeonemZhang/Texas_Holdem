import { afterEach, describe, expect, it, vi } from 'vitest';

import { copyQrCodeToClipboard } from './qr-code-clipboard.js';

afterEach(() => {
  delete window.texasHoldemDesktop;
});

describe('copyQrCodeToClipboard', () => {
  it('uses the desktop native clipboard with the QR canvas PNG', async () => {
    const copyImageToClipboard = vi.fn(async () => undefined);
    window.texasHoldemDesktop = { copyImageToClipboard } as never;
    const canvas = {
      toDataURL: vi.fn(() => 'data:image/png;base64,cXItY29kZQ=='),
    } as unknown as HTMLCanvasElement;

    await copyQrCodeToClipboard(canvas);

    expect(canvas.toDataURL).toHaveBeenCalledWith('image/png');
    expect(copyImageToClipboard).toHaveBeenCalledWith(
      'data:image/png;base64,cXItY29kZQ==',
    );
  });
});
