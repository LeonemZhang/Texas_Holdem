import { useState } from 'react';

export type HostControlIntent =
  | { readonly type: 'room.pause' }
  | { readonly type: 'room.resume' }
  | { readonly type: 'room.remove-player'; readonly targetPlayerId: string }
  | { readonly type: 'room.close' };

export interface HostControlPlayer {
  readonly playerId: string;
  readonly nickname: string;
}

export interface HostControlsProps {
  readonly isHost: boolean;
  readonly hostPlayerId: string;
  readonly phase: 'lobby' | 'playing' | 'hand-ready' | 'paused' | 'closed';
  readonly players: readonly HostControlPlayer[];
  readonly onCommand: (intent: HostControlIntent) => void;
}

export function HostControls({
  isHost,
  hostPlayerId,
  phase,
  players,
  onCommand,
}: HostControlsProps) {
  const [dangerousIntent, setDangerousIntent] =
    useState<HostControlIntent | null>(null);
  if (!isHost) return null;

  const confirmDangerous = () => {
    if (!dangerousIntent) return;
    onCommand(dangerousIntent);
    setDangerousIntent(null);
  };
  const targetName =
    dangerousIntent?.type === 'room.remove-player'
      ? players.find(
          ({ playerId }) => playerId === dangerousIntent.targetPlayerId,
        )?.nickname
      : null;

  return (
    <section className="host-controls" aria-labelledby="host-controls-title">
      <header>
        <p className="connection-home__kicker">仅房主可见</p>
        <h2 id="host-controls-title">房主管理</h2>
      </header>
      <div className="host-controls__actions">
        {phase === 'paused' ? (
          <button
            type="button"
            onClick={() => onCommand({ type: 'room.resume' })}
          >
            继续游戏
          </button>
        ) : (
          <button
            type="button"
            disabled={phase !== 'playing' && phase !== 'hand-ready'}
            onClick={() => onCommand({ type: 'room.pause' })}
          >
            暂停游戏
          </button>
        )}
        <label>
          移除玩家
          <select
            defaultValue=""
            onChange={(event) => {
              if (event.target.value)
                setDangerousIntent({
                  type: 'room.remove-player',
                  targetPlayerId: event.target.value,
                });
              event.currentTarget.value = '';
            }}
          >
            <option value="" disabled>
              选择玩家
            </option>
            {players
              .filter(({ playerId }) => playerId !== hostPlayerId)
              .map((player) => (
                <option key={player.playerId} value={player.playerId}>
                  {player.nickname}
                </option>
              ))}
          </select>
        </label>
        <button
          className="host-controls__danger"
          type="button"
          onClick={() => setDangerousIntent({ type: 'room.close' })}
        >
          关闭房间
        </button>
      </div>

      {dangerousIntent ? (
        <div
          className="host-confirmation"
          role="alertdialog"
          aria-label="确认房主管理操作"
        >
          <strong>
            {dangerousIntent.type === 'room.close'
              ? '确认关闭房间和当前对局？'
              : `确认将 ${targetName ?? '该玩家'} 移出房间？`}
          </strong>
          <p>此操作将通过服务端命令执行，不会由界面直接修改牌局。</p>
          <button type="button" onClick={confirmDangerous}>
            确认执行
          </button>
          <button type="button" onClick={() => setDangerousIntent(null)}>
            取消
          </button>
        </div>
      ) : null}
    </section>
  );
}
