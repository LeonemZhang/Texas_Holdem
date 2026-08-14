import { useId, useState } from 'react';

import type { RoomSettingsMessage } from '@texas-holdem/protocol';

import { ModalDialog } from './ModalDialog.js';
import { RoomInviteShare } from './RoomInviteShare.js';
import { RoomSettingsEditor } from './RoomSettingsEditor.js';
import { UtilityPanelHeader } from './UtilityPanel.js';

export type HostControlIntent =
  | { readonly type: 'room.pause' }
  | { readonly type: 'room.resume' }
  | {
      readonly type: 'room.update-settings';
      readonly settings: RoomSettingsMessage;
      readonly currentSmallBlind?: number;
    }
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
  readonly joinUrl?: string;
  readonly settings?: RoomSettingsMessage;
  readonly currentSmallBlind?: number;
  readonly players: readonly HostControlPlayer[];
  readonly presentation?: 'inline' | 'drawer';
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly onCommand: (intent: HostControlIntent) => void;
}

export function HostControls({
  isHost,
  hostPlayerId,
  phase,
  joinUrl,
  settings,
  currentSmallBlind,
  players,
  presentation = 'inline',
  open: controlledOpen,
  onOpenChange,
  onCommand,
}: HostControlsProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [dangerousIntent, setDangerousIntent] =
    useState<HostControlIntent | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const settingsFormId = useId();
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
  const open = controlledOpen ?? internalOpen;
  const showCurrentSmallBlind =
    phase !== 'lobby' && currentSmallBlind !== undefined;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  };

  return (
    <section
      className={`host-controls${drawer ? ' host-controls--drawer' : ''}${drawer && open ? ' host-controls--open' : ''}${drawer && !open ? ' host-controls--closed' : ''}`}
      aria-labelledby="host-controls-title"
    >
      {open ? (
        <UtilityPanelHeader
          kicker="仅房主可见"
          title="房主管理"
          titleId="host-controls-title"
          onCollapse={() => setOpen(false)}
        />
      ) : (
        <button
          className="button button--secondary"
          type="button"
          onClick={() => setOpen(true)}
        >
          房主管理
        </button>
      )}
      {open ? (
        <div id="host-controls-content" className="host-controls__actions">
          {joinUrl ? (
            <RoomInviteShare
              joinUrl={joinUrl}
              className="host-controls__invite"
            />
          ) : null}
          {settings ? (
            <section className="host-controls__settings" aria-label="房间配置">
              <button
                className="button button--secondary"
                type="button"
                aria-expanded={settingsOpen}
                onClick={() => setSettingsOpen((open) => !open)}
              >
                {settingsOpen ? '收起房间配置' : '修改房间配置'}
              </button>
              {settingsOpen ? (
                <ModalDialog
                  title="修改房间配置"
                  className="modal-dialog--room-settings"
                  confirmAction={{
                    label: '保存房间配置',
                    type: 'submit',
                    form: settingsFormId,
                  }}
                  onCancel={() => setSettingsOpen(false)}
                >
                  <RoomSettingsEditor
                    key={`${settings.roomName}-${settings.actionTimeoutSeconds}-${settings.handReadyTimeoutSeconds}-${settings.blindGrowth.enabled}-${settings.blindGrowth.intervalHands}-${settings.blindGrowth.mode ?? 'multiplier'}-${settings.blindGrowth.multiplier ?? ''}-${settings.blindGrowth.increment ?? ''}-${settings.blindGrowth.maxSmallBlind ?? ''}-${settings.zeroChipPolicy}-${showCurrentSmallBlind ? (currentSmallBlind ?? '') : 'hidden'}`}
                    settings={settings}
                    {...(!showCurrentSmallBlind ? {} : { currentSmallBlind })}
                    lockedFields={['maxPlayers', 'initialChips', 'smallBlind']}
                    formId={settingsFormId}
                    showSubmitButton={false}
                    onSubmit={(nextSettings, nextCurrentSmallBlind) => {
                      onCommand({
                        type: 'room.update-settings',
                        settings: nextSettings,
                        ...(nextCurrentSmallBlind === undefined
                          ? {}
                          : { currentSmallBlind: nextCurrentSmallBlind }),
                      });
                      setSettingsOpen(false);
                    }}
                  />
                </ModalDialog>
              ) : null}
            </section>
          ) : null}
          <div
            className="host-controls__game-actions"
            role="group"
            aria-label="游戏控制"
          >
            <h3>游戏控制</h3>
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
                <h3 id="host-controls-player-removal-title">玩家管理</h3>
                {!canRemovePlayer ? <p>每局结束后可移除</p> : null}
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
        <ModalDialog
          title="确认房主管理操作"
          role="alertdialog"
          confirmAction={{
            label: '确认执行',
            className: 'button button--danger',
            onClick: confirmDangerous,
          }}
          onCancel={() => setDangerousIntent(null)}
        >
          <strong>
            {dangerousIntent.type === 'room.close'
              ? '确认结束游戏并关闭房间？'
              : `确认将 ${targetName ?? '该玩家'} 移出房间？`}
          </strong>
          <p>此操作将通过服务端命令执行，不会由界面直接修改牌局。</p>
        </ModalDialog>
      ) : null}
    </section>
  );
}
