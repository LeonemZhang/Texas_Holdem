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
  readonly presentation?: 'inline' | 'drawer';
  readonly onCommand: (intent: HostControlIntent) => void;
}

export function HostControls({
  isHost,
  hostPlayerId,
  phase,
  players,
  presentation = 'inline',
  onCommand,
}: HostControlsProps) {
  const [open, setOpen] = useState(false);
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
  const canRemovePlayer = phase === 'lobby' || phase === 'hand-ready';
  const drawer = presentation === 'drawer';

  return (
    <section
      className={`host-controls${drawer ? ' host-controls--drawer' : ''}${drawer && open ? ' host-controls--open' : ''}${drawer && !open ? ' host-controls--closed' : ''}`}
      aria-labelledby="host-controls-title"
    >
      <header className="host-controls__header">
        {!drawer || open ? (
          <div>
            <p className="connection-home__kicker">仅房主可见</p>
            <h2 id="host-controls-title">房主管理</h2>
          </div>
        ) : null}
        <button
          className={drawer ? 'button button--secondary' : undefined}
          type="button"
          aria-expanded={open}
          aria-controls="host-controls-content"
          onClick={() => setOpen((current) => !current)}
        >
          {open
            ? drawer
              ? '关闭房主管理'
              : '收起房主管理'
            : drawer
              ? '房主管理'
              : '展开房主管理'}
        </button>
      </header>
      {open ? (
        <div id="host-controls-content" className="host-controls__actions">
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
              disabled={!canRemovePlayer}
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
            {!canRemovePlayer ? <small>每手结束后可移除</small> : null}
          </label>
          <button
            className="host-controls__danger"
            type="button"
            onClick={() => setDangerousIntent({ type: 'room.close' })}
          >
            关闭房间
          </button>
        </div>
      ) : !drawer ? (
        <p className="host-controls__hint">暂停、移除玩家和关闭房间</p>
      ) : null}

      {open && dangerousIntent ? (
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
