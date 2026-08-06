import {
  Fragment,
  useLayoutEffect,
  useMemo,
  useRef,
  type CSSProperties,
} from 'react';

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
  readonly totalCommitted?: number;
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
}

export interface TableSeatsProps {
  readonly players: readonly TableSeatPlayer[];
  readonly ownPlayerId: string;
  readonly actionRoundKey?: string | null;
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

function SeatContents({ player }: { readonly player: TableSeatPlayer }) {
  return (
    <>
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
      <span className="table-seat__bets">
        <span
          className="table-seat__hand-bet"
          aria-label={`本局下注 ${player.totalCommitted ?? 0}`}
        >
          <span className="table-seat__bet-label--desktop" aria-hidden="true">
            本局下注{' '}
          </span>
          <span className="table-seat__bet-label--mobile" aria-hidden="true">
            本局{' '}
          </span>
          {player.totalCommitted?.toLocaleString('zh-CN') ?? 0}
        </span>
        <span
          className="table-seat__street-bet"
          aria-label={`本轮下注 ${player.streetCommitted ?? 0}`}
        >
          <span className="table-seat__bet-label--desktop" aria-hidden="true">
            本轮下注{' '}
          </span>
          <span className="table-seat__bet-label--mobile" aria-hidden="true">
            本轮{' '}
          </span>
          {player.streetCommitted?.toLocaleString('zh-CN') ?? 0}
        </span>
      </span>
    </>
  );
}

export function TableSeats({
  players,
  ownPlayerId,
  actionRoundKey = null,
}: TableSeatsProps) {
  const listRef = useRef<HTMLOListElement>(null);
  const desktopPlayers = useMemo(
    () =>
      [...players].sort((left, right) => {
        if (left.playerId === ownPlayerId) return -1;
        if (right.playerId === ownPlayerId) return 1;
        return left.seatIndex - right.seatIndex;
      }),
    [ownPlayerId, players],
  );
  const orderedPlayers = useMemo(
    () =>
      [...players].sort((left, right) => {
        if (left.actionOrder != null && right.actionOrder != null) {
          return left.actionOrder - right.actionOrder;
        }
        if (left.actionOrder != null) return -1;
        if (right.actionOrder != null) return 1;
        return left.seatIndex - right.seatIndex;
      }),
    [players],
  );
  const currentActor = orderedPlayers.find((player) => player.isCurrentActor);
  const stablePosition = new Map(
    desktopPlayers.map((player, index) => [player.playerId, index]),
  );
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list || !currentActor) return;
    const actorCard = Array.from(
      list.querySelectorAll<HTMLElement>('[data-mobile-queue-player-id]'),
    ).find(
      (element) =>
        element.dataset.mobileQueuePlayerId === currentActor.playerId,
    );
    if (!actorCard) return;

    const maxScrollLeft = Math.max(0, list.scrollWidth - list.clientWidth);
    const targetScrollLeft = Math.min(actorCard.offsetLeft, maxScrollLeft);
    if (list.scrollTo) {
      list.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
    } else {
      list.scrollLeft = targetScrollLeft;
    }
  }, [actionRoundKey, currentActor?.playerId]);
  const layout =
    desktopPlayers.length === 2
      ? 'heads-up'
      : desktopPlayers.length === 3
        ? 'three-handed'
        : 'multi-handed';

  return (
    <ol
      className="table-seats"
      data-layout={layout}
      data-player-count={desktopPlayers.length}
      ref={listRef}
      aria-label={`${desktopPlayers.length} 人座位布局`}
    >
      {orderedPlayers.map((player) => {
        const stateClasses = [
          'table-seat',
          `table-seat--${player.status}`,
          `table-seat--color-${player.seatIndex % 6}`,
          player.isCurrentActor ? 'table-seat--acting' : '',
          player.playerId === ownPlayerId ? 'table-seat--own' : '',
        ]
          .filter(Boolean)
          .join(' ');
        const mobileOwnSummaryClasses = [
          'table-seat',
          `table-seat--${player.status}`,
          `table-seat--color-${player.seatIndex % 6}`,
          player.isCurrentActor ? 'table-seat--acting' : '',
          'table-seat--mobile-own-summary',
        ]
          .filter(Boolean)
          .join(' ');
        return (
          <Fragment key={player.playerId}>
            {player.playerId === ownPlayerId ? (
              <li
                className={mobileOwnSummaryClasses}
                aria-hidden="true"
                data-mobile-queue-player-id={player.playerId}
              >
                <SeatContents player={player} />
              </li>
            ) : null}
            <li
              className={stateClasses}
              data-player-id={player.playerId}
              data-mobile-queue-player-id={
                player.playerId === ownPlayerId ? undefined : player.playerId
              }
              style={positionFor(
                stablePosition.get(player.playerId) ?? 0,
                desktopPlayers.length,
              )}
              aria-current={player.isCurrentActor ? 'true' : undefined}
            >
              <SeatContents player={player} />
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}
