import { useState } from 'react';

import { CopyableQRCode } from './CopyableQRCode.js';

export interface RoomInviteShareProps {
  readonly joinUrl: string;
  readonly className?: string;
}

export function RoomInviteShare({
  joinUrl,
  className = 'room-invite',
}: RoomInviteShareProps) {
  const [copied, setCopied] = useState(false);

  const copyInvite = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <section className={className} aria-label="房间邀请">
      <div className="room-invite__details">
        <span>邀请朋友加入</span>
        <code>{joinUrl}</code>
        <button
          className="button button--secondary"
          type="button"
          onClick={() => void copyInvite()}
        >
          {copied ? '已复制邀请链接' : '复制邀请链接'}
        </button>
      </div>
      <CopyableQRCode value={joinUrl} size={78} title="加入房间二维码" />
    </section>
  );
}
