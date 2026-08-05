import type { ReactNode } from 'react';

import type { ConnectionState } from './connection.js';
import { networkErrorMessage } from './error-message.js';

export interface ConnectionGuardProps {
  readonly state: ConnectionState;
  readonly synchronizationError?: string | null;
  readonly children: ReactNode;
  readonly onRetry: () => void;
}

export function ConnectionGuard({
  state,
  synchronizationError,
  children,
  onRetry,
}: ConnectionGuardProps) {
  const recovering =
    state.status === 'recovering' || state.status === 'connecting';
  const error = networkErrorMessage(
    state.status === 'failed' ? state.error : synchronizationError,
  );
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
    </div>
  );
}
