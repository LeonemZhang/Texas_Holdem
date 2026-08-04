import { useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';

import { copyQrCodeToClipboard } from './qr-code-clipboard.js';

export interface CopyableQRCodeProps {
  readonly value: string;
  readonly size: number;
  readonly title: string;
}

export function CopyableQRCode({ value, size, title }: CopyableQRCodeProps) {
  const qrCode = useRef<HTMLCanvasElement>(null);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>(
    'idle',
  );

  const copy = async () => {
    if (!qrCode.current) return;
    try {
      await copyQrCodeToClipboard(qrCode.current);
      setCopyState('copied');
    } catch (reason) {
      console.error('Failed to copy invitation QR code', reason);
      setCopyState('failed');
    }
  };

  return (
    <div className="copyable-qr-code">
      <QRCodeCanvas
        ref={qrCode}
        value={value}
        size={size}
        title={title}
        role="img"
        aria-label={title}
      />
      <button
        className="button button--secondary copyable-qr-code__button"
        type="button"
        onClick={() => void copy()}
      >
        {copyState === 'copied' ? '已复制二维码' : '复制二维码'}
      </button>
      {copyState === 'failed' ? (
        <small className="copyable-qr-code__error" role="status">
          复制二维码失败，请重试
        </small>
      ) : null}
    </div>
  );
}
