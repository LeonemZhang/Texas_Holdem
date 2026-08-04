import { useEffect, useMemo, useRef, type CSSProperties } from 'react';

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
    left: `${50 + Math.cos(angle) * 41}%`,
    top: `${50 + Math.sin(angle) * 34}%`,
  };
}

export function TableSeats({ players, ownPlayerId }: TableSeatsProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const stablePlayers = useMemo(
    () =>
      [...players].sort((left, right) => {
        if (left.playerId === ownPlayerId) return -1;
        if (right.playerId === ownPlayerId) return 1;
        return left.seatIndex - right.seatIndex;
      }),
    [ownPlayerId, players],
  );
  const currentActor = stablePlayers.find((player) => player.isCurrentActor);
  const orderedPlayers = currentActor
    ? [
        currentActor,
        ...stablePlayers.filter(
          (player) => player.playerId !== currentActor.playerId,
        ),
      ]
    : stablePlayers;
  const stablePosition = new Map(
    stablePlayers.map((player, index) => [player.playerId, index]),
  );
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    list.scrollLeft = 0;
    list.scrollTo?.({ left: 0, behavior: 'smooth' });
  }, [currentActor?.playerId]);
  const layout =
    stablePlayers.length === 2
      ? 'heads-up'
      : stablePlayers.length === 3
        ? 'three-handed'
        : 'multi-handed';

  return (
    <ol
      className="table-seats"
      data-layout={layout}
      data-player-count={stablePlayers.length}
      ref={listRef}
      aria-label={`${stablePlayers.length} 人座位布局`}
    >
      {currentActor?.playerId === ownPlayerId ? (
        <li
          className="table-seat table-seat--acting table-seat--mobile-acting-summary"
          aria-hidden="true"
          data-player-id={`${currentActor.playerId}-mobile-acting-summary`}
        >
          <span className="table-seat__name">{currentActor.nickname}</span>
          <span className="table-seat__mobile-acting-order">
            行动中 · 顺位 {currentActor.actionOrder ?? '未定'}
          </span>
          <strong>{currentActor.chips.toLocaleString('zh-CN')}</strong>
          <small>{statusLabels[currentActor.status]}</small>
        </li>
      ) : null}
      {orderedPlayers.map((player) => {
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
            style={positionFor(
              stablePosition.get(player.playerId) ?? 0,
              stablePlayers.length,
            )}
            aria-current={player.isCurrentActor ? 'true' : undefined}
          >
            <span className="table-seat__name">{player.nickname}</span>
            {player.actionOrder ? (
              <span className="table-seat__action-order">
                <span className="table-seat__action-order--desktop">
                  行动顺位 {player.actionOrder}
                </span>
                <span className="table-seat__action-order--mobile">
                  顺位 {player.actionOrder}
                </span>
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
              <>
                <span className="table-seat__acting-indicator">行动中</span>
                <span className="table-seat__mobile-acting-order">
                  行动中 · 顺位 {player.actionOrder ?? '未定'}
                </span>
              </>
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
