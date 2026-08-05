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
}

export function TableUtilityToolbar({
  activePanel,
  isHost,
  onOpenPanel,
  onExitRoom,
  exitRoomDisabled = false,
}: TableUtilityToolbarProps) {
  return (
    <div className="poker-table-page__header-actions">
      <div className="poker-table-page__utility-actions">
        <button
          className="button button--secondary"
          type="button"
          aria-expanded={activePanel === 'chip-exchange'}
          onClick={(event) => onOpenPanel('chip-exchange', event.currentTarget)}
        >
          筹码交换
        </button>
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
        <button
          className="button button--secondary"
          type="button"
          aria-expanded={activePanel === 'statistics'}
          onClick={(event) => onOpenPanel('statistics', event.currentTarget)}
        >
          查看统计
        </button>
      </div>
      {onExitRoom ? (
        <ExitRoomAction disabled={exitRoomDisabled} onConfirm={onExitRoom} />
      ) : null}
    </div>
  );
}
