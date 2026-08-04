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
          <div
            className="host-controls__game-actions"
            role="group"
            aria-label="游戏控制"
          >
            {phase === 'paused' ? (
              <button
                className="button button--secondary"
                type="button"
                onClick={() => onCommand({ type: 'room.resume' })}
              >
                继续游戏
              </button>
            ) : (
              <button
                className="button button--secondary"
                type="button"
                disabled={phase !== 'playing' && phase !== 'hand-ready'}
                onClick={() => onCommand({ type: 'room.pause' })}
              >
                暂停游戏
              </button>
            )}
            <button
              className="button button--danger"
              type="button"
              onClick={() => setDangerousIntent({ type: 'room.close' })}
            >
              结束游戏
            </button>
          </div>

          <section
            className="host-controls__player-removal"
            aria-labelledby="host-controls-player-removal-title"
          >
            <header>
              <div>
                <h3 id="host-controls-player-removal-title">踢出玩家</h3>
                {!canRemovePlayer ? <p>每手结束后可移除</p> : null}
              </div>
            </header>
            <ul aria-label="房间玩家列表">
              {players.map((player) => {
                const isHostPlayer = player.playerId === hostPlayerId;
                return (
                  <li key={player.playerId}>
                    <span>
                      {player.nickname}
                      {isHostPlayer ? <em>房主</em> : null}
                    </span>
                    {!isHostPlayer ? (
                      <button
                        className="button button--danger"
                        type="button"
                        aria-label={`踢出 ${player.nickname}`}
                        disabled={!canRemovePlayer}
                        onClick={() =>
                          setDangerousIntent({
                            type: 'room.remove-player',
                            targetPlayerId: player.playerId,
                          })
                        }
                      >
                        踢出
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
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
              ? '确认结束游戏并关闭房间？'
              : `确认将 ${targetName ?? '该玩家'} 移出房间？`}
          </strong>
          <p>此操作将通过服务端命令执行，不会由界面直接修改牌局。</p>
          <button
            className="button button--danger"
            type="button"
            onClick={confirmDangerous}
          >
            确认执行
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => setDangerousIntent(null)}
          >
            取消
          </button>
        </div>
      ) : null}
    </section>
  );
}
