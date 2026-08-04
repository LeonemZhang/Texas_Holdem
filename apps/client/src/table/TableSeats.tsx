import type { CSSProperties } from 'react';

export type TableSeatStatus =
  | 'waiting'
  | 'active'
  | 'folded'
  | 'all-in'
  | 'sitting-out'
  | 'eliminated'
  | 'left'
  | 'removed'
  | 'disconnected';

export interface TableSeatPlayer {
  readonly playerId: string;
  readonly nickname: string;
  readonly seatIndex: number;
  readonly chips: number;
  readonly streetCommitted?: number;
  readonly actionOrder?: number | null | undefined;
  readonly status: TableSeatStatus;
  readonly isCurrentActor?: boolean;
  readonly isDealer?: boolean;
  readonly isSmallBlind?: boolean;
  readonly isBigBlind?: boolean;
  readonly lastAction?:
    'fold' | 'check' | 'call' | 'raiseTo' | 'allIn' | null | undefined;
  readonly settlement?: {
    readonly netChange: number;
    readonly handType?: string;
  };
  readonly onShowHoleCards?: () => void;
}

export interface TableSeatsProps {
  readonly players: readonly TableSeatPlayer[];
  readonly ownPlayerId: string;
}

const statusLabels: Record<TableSeatStatus, string> = {
  waiting: '等待中',
  active: '在局',
  folded: '已弃牌',
  'all-in': '全押',
  'sitting-out': '暂不参与',
  eliminated: '已出局',
  left: '已离开',
  removed: '已退出',
  disconnected: '已掉线',
};

const actionLabels = {
  fold: '弃牌',
  check: '过牌',
  call: '跟注',
  raiseTo: '加注',
  allIn: '全押',
} as const;

function positionFor(index: number, count: number): CSSProperties {
  const angle = (Math.PI / 2 + (index * Math.PI * 2) / count) % (Math.PI * 2);
  return {
    left: `${50 + Math.cos(angle) * 45}%`,
    top: `${50 + Math.sin(angle) * 43}%`,
  };
}

export function TableSeats({ players, ownPlayerId }: TableSeatsProps) {
  const sorted = [...players].sort((left, right) => {
    if (left.playerId === ownPlayerId) return -1;
    if (right.playerId === ownPlayerId) return 1;
    return left.seatIndex - right.seatIndex;
  });
  const layout =
    sorted.length === 2
      ? 'heads-up'
      : sorted.length === 3
        ? 'three-handed'
        : 'multi-handed';

  return (
    <ol
      className="table-seats"
      data-layout={layout}
      aria-label={`${sorted.length} 人座位布局`}
    >
      {sorted.map((player, index) => {
        const stateClasses = [
          'table-seat',
          `table-seat--${player.status}`,
          `table-seat--color-${player.seatIndex % 6}`,
          player.isCurrentActor ? 'table-seat--acting' : '',
          player.onShowHoleCards ? 'table-seat--can-show-hole-cards' : '',
          player.playerId === ownPlayerId ? 'table-seat--own' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <li
            className={stateClasses}
            data-player-id={player.playerId}
            key={player.playerId}
            style={positionFor(index, sorted.length)}
            aria-current={player.isCurrentActor ? 'true' : undefined}
          >
            <span className="table-seat__name">{player.nickname}</span>
            {player.actionOrder ? (
              <span className="table-seat__action-order">
                行动顺位 {player.actionOrder}
              </span>
            ) : null}
            {player.isDealer || player.isSmallBlind || player.isBigBlind ? (
              <span className="table-seat__position-labels">
                {player.isDealer ? <i>庄家</i> : null}
                {player.isSmallBlind ? <i>小盲</i> : null}
                {player.isBigBlind ? <i>大盲</i> : null}
              </span>
            ) : null}
            {player.isCurrentActor ? (
              <span className="table-seat__acting-indicator">行动中</span>
            ) : null}
            {player.lastAction ? (
              <span className="table-seat__last-action">
                {actionLabels[player.lastAction]}
              </span>
            ) : null}
            {player.onShowHoleCards ? (
              <button
                className="table-seat__show-hole-cards"
                type="button"
                onClick={player.onShowHoleCards}
              >
                摊牌
              </button>
            ) : null}
            <strong>{player.chips.toLocaleString('zh-CN')}</strong>
            <small>{statusLabels[player.status]}</small>
            {player.settlement ? (
              <div className="table-seat__settlement" role="status">
                {player.settlement.handType ? (
                  <span>{player.settlement.handType}</span>
                ) : null}
                <strong
                  className={
                    player.settlement.netChange >= 0
                      ? 'table-seat__settlement--positive'
                      : 'table-seat__settlement--negative'
                  }
                >
                  {player.settlement.netChange >= 0 ? '+' : ''}
                  {player.settlement.netChange.toLocaleString('zh-CN')}
                </strong>
              </div>
            ) : null}
            <span className="table-seat__street-bet">
              本轮下注 {player.streetCommitted?.toLocaleString('zh-CN') ?? 0}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
