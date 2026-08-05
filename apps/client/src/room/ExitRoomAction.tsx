import { useEffect, useRef, useState } from 'react';

import { ModalDialog } from './ModalDialog.js';

export interface ExitRoomActionProps {
  readonly disabled?: boolean;
  readonly onConfirm: () => void;
}

export function ExitRoomAction({
  disabled = false,
  onConfirm,
}: ExitRoomActionProps) {
  const [armed, setArmed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const actionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!armed) return undefined;
    const resetIfOutside = (event: PointerEvent) => {
      if (!actionRef.current?.contains(event.target as Node)) setArmed(false);
    };
    const resetOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setArmed(false);
    };
    document.addEventListener('pointerdown', resetIfOutside);
    document.addEventListener('keydown', resetOnEscape);
    return () => {
      document.removeEventListener('pointerdown', resetIfOutside);
      document.removeEventListener('keydown', resetOnEscape);
    };
  }, [armed]);

  return (
    <div className="exit-room-action" ref={actionRef}>
      <button
        className={`button exit-room-action__button${armed ? ' exit-room-action__button--armed' : ''}`}
        type="button"
        disabled={disabled}
        aria-label="退出房间"
        aria-expanded={armed}
        onClick={() => {
          if (!armed) {
            setArmed(true);
            return;
          }
          setArmed(false);
          setConfirming(true);
        }}
      >
        {armed ? '退出房间' : '×'}
      </button>

      {confirming ? (
        <ModalDialog
          title="确认退出房间"
          role="alertdialog"
          confirmAction={{
            label: '确认退出',
            className: 'button button--danger',
            onClick: () => {
              setConfirming(false);
              onConfirm();
            },
          }}
          onCancel={() => setConfirming(false)}
        >
          <strong>确认主动退出房间？</strong>
          <p>退出后将清除本机重连身份；关闭网页则不会清除。</p>
        </ModalDialog>
      ) : null}
    </div>
  );
}
