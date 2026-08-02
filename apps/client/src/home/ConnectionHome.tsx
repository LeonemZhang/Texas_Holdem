import { useState, type FormEvent } from 'react';

import { parseManualJoinAddress } from '@texas-holdem/lan-discovery/health';

import type { RuntimeKind } from '../runtime.js';

export interface ConnectionHomeProps {
  readonly runtimeKind: RuntimeKind;
  readonly onCreateRoom: () => void;
  readonly onManageRecords?: () => void;
  readonly onRefreshRooms: () => void;
  readonly onJoinAddress: (url: string) => void;
}

export function ConnectionHome({
  runtimeKind,
  onCreateRoom,
  onManageRecords,
  onRefreshRooms,
  onJoinAddress,
}: ConnectionHomeProps) {
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const desktop = runtimeKind === 'desktop';

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const url = parseManualJoinAddress(address);
      setError(null);
      onJoinAddress(url.toString());
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : '请输入有效的房主 IP',
      );
    }
  };

  return (
    <section className="connection-home" aria-labelledby="connection-heading">
      <div className="connection-home__heading">
        <div>
          <p className="connection-home__kicker">
            {desktop ? '桌面房主与玩家' : '浏览器玩家'}
          </p>
          <h2 id="connection-heading">和朋友开始一桌</h2>
        </div>
        {desktop ? (
          <div className="connection-home__desktop-actions">
            <button
              type="button"
              className="button button--primary"
              onClick={onCreateRoom}
            >
              创建房间
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={onManageRecords ?? onCreateRoom}
            >
              管理对局记录
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={onRefreshRooms}
            >
              刷新房间
            </button>
          </div>
        ) : null}
      </div>

      <form className="join-form" onSubmit={submit} noValidate>
        <label htmlFor="host-address">房主 IP 或完整地址</label>
        <div className="join-form__row">
          <input
            id="host-address"
            name="hostAddress"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="10.126.126.1"
            inputMode="url"
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? 'host-address-error' : undefined}
          />
          <button type="submit" className="button button--primary">
            直接加入
          </button>
        </div>
        {error ? (
          <p id="host-address-error" className="form-error" role="alert">
            {error}
          </p>
        ) : (
          <p className="form-help">裸 IP 会自动使用 32100 端口。</p>
        )}
      </form>
    </section>
  );
}
