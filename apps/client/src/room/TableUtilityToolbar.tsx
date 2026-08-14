import { ExitRoomAction } from './ExitRoomAction.js';

export type TableUtilityPanel = 'host' | 'chip-exchange' | 'statistics';

export interface TableUtilityToolbarProps {
  readonly activePanel: TableUtilityPanel | null;
  readonly isHost: boolean;
  readonly onOpenPanel: (
    panel: TableUtilityPanel,
    trigger: HTMLButtonElement,
  ) => void;
  readonly onExitRoom?: (() => void) | undefined;
  readonly exitRoomDisabled?: boolean;
  readonly spectator?: boolean;
  readonly onBackToLobby?: (() => void) | undefined;
}

export function TableUtilityToolbar({
  activePanel,
  isHost,
  onOpenPanel,
  onExitRoom,
  exitRoomDisabled = false,
  spectator = false,
  onBackToLobby,
}: TableUtilityToolbarProps) {
  return (
    <div className="poker-table-page__header-actions">
      <div className="poker-table-page__utility-actions">
        {!spectator ? (
          <button
            className="button button--secondary"
            type="button"
            aria-expanded={activePanel === 'chip-exchange'}
            onClick={(event) =>
              onOpenPanel('chip-exchange', event.currentTarget)
            }
          >
            筹码交换
          </button>
        ) : null}
        {isHost ? (
          <button
            className="button button--secondary"
            type="button"
            aria-expanded={activePanel === 'host'}
            onClick={(event) => onOpenPanel('host', event.currentTarget)}
          >
            房主管理
          </button>
        ) : null}
        {!spectator ? (
          <button
            className="button button--secondary"
            type="button"
            aria-expanded={activePanel === 'statistics'}
            onClick={(event) => onOpenPanel('statistics', event.currentTarget)}
          >
            查看统计
          </button>
        ) : null}
        {onBackToLobby ? (
          <button
            className="button button--secondary"
            type="button"
            onClick={onBackToLobby}
          >
            返回房主控制台
          </button>
        ) : null}
      </div>
      {onExitRoom ? (
        <ExitRoomAction disabled={exitRoomDisabled} onConfirm={onExitRoom} />
      ) : null}
    </div>
  );
}
