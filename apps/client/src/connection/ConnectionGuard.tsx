import { useState, type ReactNode } from 'react';

import type { ConnectionState } from './connection.js';
import { networkErrorMessage } from './error-message.js';

export interface ConnectionGuardProps {
  readonly state: ConnectionState;
  readonly synchronizationError?: string | null;
  readonly children: ReactNode;
  readonly onRetry: () => void;
  readonly onExitRoom: () => void;
  readonly clearReconnectSession: () => void;
}

export function ConnectionGuard({
  state,
  synchronizationError,
  children,
  onRetry,
  onExitRoom,
  clearReconnectSession,
}: ConnectionGuardProps) {
  const [confirmingExit, setConfirmingExit] = useState(false);
  const recovering =
    state.status === 'recovering' || state.status === 'connecting';
  const error = networkErrorMessage(
    state.status === 'failed' ? state.error : synchronizationError,
  );
  const exitRoom = () => {
    clearReconnectSession();
    onExitRoom();
    setConfirmingExit(false);
  };

  return (
    <div className="connection-guard">
      {recovering ? (
        <div className="connection-banner" role="status">
          <span className="connection-banner__spinner" aria-hidden="true" />
          <strong>
            {state.status === 'connecting'
              ? '正在连接房间…'
              : `连接中断，正在恢复：${state.reason}`}
          </strong>
          <span>恢复期间已暂时锁定游戏操作，座位和数据会保留。</span>
        </div>
      ) : null}
      {error && (state.status === 'failed' || synchronizationError) ? (
        <div
          className="connection-banner connection-banner--error"
          role="alert"
        >
          <strong>连接或同步失败</strong>
          <span>{error}</span>
          <button type="button" onClick={onRetry}>
            重试
          </button>
        </div>
      ) : null}

      <fieldset className="connection-guard__content" disabled={recovering}>
        {children}
      </fieldset>

      <footer className="connection-guard__footer">
        <span>直接关闭网页只会掉线，可用原身份恢复。</span>
        <button type="button" onClick={() => setConfirmingExit(true)}>
          退出房间
        </button>
      </footer>

      {confirmingExit ? (
        <div
          className="exit-confirmation"
          role="alertdialog"
          aria-label="确认退出房间"
        >
          <strong>确认主动退出房间？</strong>
          <p>退出后将清除本机重连身份；关闭网页则不会清除。</p>
          <button type="button" onClick={exitRoom}>
            确认退出
          </button>
          <button type="button" onClick={() => setConfirmingExit(false)}>
            取消
          </button>
        </div>
      ) : null}
    </div>
  );
}
