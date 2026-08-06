import { useEffect, useState, type FormEvent } from 'react';

import { parseManualJoinAddress } from '@texas-holdem/lan-discovery/health';

import type { RoomRecordSummary, RuntimeKind } from '../runtime.js';

export interface ConnectionHomeProps {
  readonly runtimeKind: RuntimeKind;
  readonly initialAddress?: string;
  readonly onCreateRoom: () => void;
  readonly onManageRecords?: () => void;
  readonly onRefreshRooms: () => void;
  readonly onOpenDiagnostics?: () => void;
  readonly joinReady: boolean;
  readonly initialNickname?: string;
  readonly resumeNicknameChange?: boolean;
  readonly joinError?: string | null;
  readonly runningRoomRecord?: RoomRecordSummary | null;
  readonly recoveringRunningRoom?: boolean;
  readonly runningRoomRecoveryError?: string | null;
  readonly onRecoverRunningRoom?: () => void;
  readonly onProbeAddress: (url: string) => Promise<boolean>;
  readonly onResetProbe: () => void;
  readonly onJoin: (nickname: string) => void;
}

export function ConnectionHome({
  runtimeKind,
  initialAddress = '',
  onCreateRoom,
  onManageRecords,
  onRefreshRooms,
  onOpenDiagnostics,
  joinReady,
  initialNickname,
  resumeNicknameChange = false,
  joinError = null,
  runningRoomRecord = null,
  recoveringRunningRoom = false,
  runningRoomRecoveryError = null,
  onRecoverRunningRoom,
  onProbeAddress,
  onResetProbe,
  onJoin,
}: ConnectionHomeProps) {
  const [address, setAddress] = useState(initialAddress);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [nickname, setNickname] = useState(initialNickname ?? 'Bob');
  const desktop = runtimeKind === 'desktop';

  useEffect(() => {
    if (resumeNicknameChange && initialNickname !== undefined) {
      setNickname(initialNickname);
    }
  }, [initialNickname, resumeNicknameChange]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      const url = parseManualJoinAddress(address);
      setError(null);
      setChecking(true);
      await onProbeAddress(url.toString());
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : '请输入有效的房主 IP',
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <section
      className="connection-home game-lobby"
      aria-labelledby="connection-heading"
    >
      <div className="connection-home__heading">
        <div>
          <p className="connection-home__kicker">
            {desktop ? 'LAN · 私人赌桌' : '浏览器 · 加入牌桌'}
          </p>
          <h2 id="connection-heading">牌桌大厅</h2>
          <p className="game-lobby__tagline">洗牌、落座，下一手就开局。</p>
        </div>
        {desktop ? (
          <div className="connection-home__desktop-actions">
            <button
              type="button"
              className="button button--primary"
              onClick={onCreateRoom}
            >
              创建牌局
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={onManageRecords ?? onCreateRoom}
            >
              对局记录
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={onRefreshRooms}
            >
              扫描牌桌
            </button>
            <button
              type="button"
              className="button button--secondary"
              onClick={onOpenDiagnostics}
            >
              网络诊断
            </button>
          </div>
        ) : null}
      </div>

      {desktop && runningRoomRecord ? (
        <section
          className="running-room-recovery"
          aria-labelledby="running-room-recovery-title"
        >
          <div>
            <p className="connection-home__kicker">本机房主仍在运行</p>
            <h3 id="running-room-recovery-title">
              继续“{runningRoomRecord.roomName}”
            </h3>
            <p>
              房主 {runningRoomRecord.hostNickname} ·{' '}
              {runningRoomRecord.playerCount} 人 · 已完成{' '}
              {runningRoomRecord.completedHands} 手
            </p>
            <small>
              最近活动：
              {new Date(runningRoomRecord.lastActiveAt).toLocaleString()}
            </small>
          </div>
          <div className="running-room-recovery__actions">
            <span className="desktop-room-records__status desktop-room-records__status--running">
              进行中
            </span>
            <button
              className="button button--primary"
              type="button"
              disabled={recoveringRunningRoom}
              onClick={onRecoverRunningRoom}
            >
              {recoveringRunningRoom ? '正在恢复…' : '恢复对局'}
            </button>
          </div>
          {runningRoomRecoveryError ? (
            <p className="form-error" role="alert">
              {runningRoomRecoveryError}
            </p>
          ) : null}
        </section>
      ) : null}

      <form className="join-form" onSubmit={submit} noValidate>
        <label htmlFor="host-address">IP 直连到房主牌桌</label>
        <div className="join-form__row">
          <input
            id="host-address"
            name="hostAddress"
            value={address}
            onChange={(event) => {
              setAddress(event.target.value);
              if (joinReady) onResetProbe();
            }}
            placeholder="10.126.126.1"
            inputMode="url"
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? 'host-address-error' : undefined}
          />
          <button
            type="submit"
            className="button button--primary"
            disabled={checking}
          >
            {checking ? '正在检测…' : joinReady ? '重新检测' : '检测房间'}
          </button>
        </div>
        {(error ?? joinError) ? (
          <p id="host-address-error" className="form-error" role="alert">
            {error ?? joinError}
          </p>
        ) : (
          <p className="form-help">输入裸 IP 时会自动使用 32100 端口。</p>
        )}
        {joinReady ? (
          <div className="join-form__confirm" role="status">
            <strong>
              {resumeNicknameChange ? '恢复原身份' : '牌桌连接正常'}
            </strong>
            {resumeNicknameChange ? (
              <p className="form-help">使用原令牌恢复，不会创建新的座位。</p>
            ) : null}
            <label htmlFor="join-nickname">玩家昵称</label>
            <div className="join-form__row">
              <input
                id="join-nickname"
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                autoComplete="nickname"
              />
              <button
                className="button button--primary"
                type="button"
                disabled={!nickname.trim()}
                onClick={() => onJoin(nickname.trim())}
              >
                {resumeNicknameChange ? '确认恢复' : '确认加入'}
              </button>
            </div>
          </div>
        ) : null}
      </form>
    </section>
  );
}
