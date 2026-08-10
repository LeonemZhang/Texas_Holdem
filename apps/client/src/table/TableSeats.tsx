import { useLayoutEffect, useMemo, useRef, type CSSProperties } from 'react';

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

const TABLE_SEAT_COUNT = 10;
const TEN_PLAYER_TOPS = [84, 78, 62, 34, 12, 10, 12, 34, 62, 78] as const;
const HEADS_UP_POSITIONS = [
  [50, 87],
  [50, 10],
] as const;
const FOUR_PLAYER_POSITIONS = [
  [50, 86],
  [18, 50],
  [50, 10],
  [82, 50],
] as const;
const SAFE_MULTI_PLAYER_TOPS: Readonly<Record<number, readonly number[]>> = {
  6: [84, 70, 30, 10, 30, 70],
  7: [84, 70, 43, 10, 10, 43, 70],
  8: [84, 78, 50, 24, 10, 24, 50, 78],
  9: [84, 73, 56, 30, 10, 10, 30, 56, 73],
};
const SAFE_MULTI_PLAYER_HORIZONTAL_OVERRIDES: Readonly<
  Record<number, Readonly<Record<number, number>>>
> = {
  7: { 2: 11, 5: 89 },
  9: { 3: 17, 6: 83 },
};
const OWN_SEAT_BOTTOM_TOPS: Readonly<Record<number, number>> = {
  3: 87,
  6: 87,
  7: 87,
  8: 87,
  9: 87,
  10: 87,
};

function clockwiseDistance(fromSeatIndex: number, toSeatIndex: number): number {
  return (toSeatIndex - fromSeatIndex + TABLE_SEAT_COUNT) % TABLE_SEAT_COUNT;
}

function compareClockwiseFrom(
  left: TableSeatPlayer,
  right: TableSeatPlayer,
  centerSeatIndex: number,
): number {
  const leftDistance = clockwiseDistance(centerSeatIndex, left.seatIndex);
  const rightDistance = clockwiseDistance(centerSeatIndex, right.seatIndex);
  return leftDistance - rightDistance || left.seatIndex - right.seatIndex;
}

function positionFor(
  index: number,
  count: number,
  isOwn = false,
): CSSProperties {
  const explicitPositions =
    count === HEADS_UP_POSITIONS.length
      ? HEADS_UP_POSITIONS
      : count === FOUR_PLAYER_POSITIONS.length
        ? FOUR_PLAYER_POSITIONS
        : null;
  const explicitPosition = explicitPositions?.[index];
  if (explicitPosition) {
    return {
      left: `${explicitPosition[0]}%`,
      top: `${explicitPosition[1]}%`,
    };
  }

  const angle = (Math.PI / 2 + (index * Math.PI * 2) / count) % (Math.PI * 2);
  const safeLeft = SAFE_MULTI_PLAYER_HORIZONTAL_OVERRIDES[count]?.[index];
  const safeTop = SAFE_MULTI_PLAYER_TOPS[count]?.[index];
  const ownSeatBottomTop = isOwn ? OWN_SEAT_BOTTOM_TOPS[count] : undefined;
  return {
    left: `${safeLeft ?? 50 + Math.cos(angle) * 41}%`,
    top: `${ownSeatBottomTop ?? (count === TEN_PLAYER_TOPS.length ? TEN_PLAYER_TOPS[index]! : (safeTop ?? 50 + Math.sin(angle) * 34))}%`,
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
        <span
          className={[
            'table-seat__position-labels',
            player.isDealer && player.isSmallBlind
              ? 'table-seat__position-labels--dealer-small-blind'
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
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
  const queueRef = useRef<HTMLDivElement>(null);
  const ownSeatIndex =
    players.find((player) => player.playerId === ownPlayerId)?.seatIndex ?? 0;
  const desktopPlayers = useMemo(
    () =>
      [...players].sort((left, right) =>
        compareClockwiseFrom(left, right, ownSeatIndex),
      ),
    [ownSeatIndex, players],
  );
  const orderedPlayers = useMemo(
    () =>
      [...players].sort((left, right) => {
        if (left.actionOrder != null && right.actionOrder != null) {
          return left.actionOrder - right.actionOrder;
        }
        if (left.actionOrder != null) return -1;
        if (right.actionOrder != null) return 1;
        return compareClockwiseFrom(left, right, ownSeatIndex);
      }),
    [ownSeatIndex, players],
  );
  const currentActor = orderedPlayers.find((player) => player.isCurrentActor);
  const stablePosition = new Map(
    desktopPlayers.map((player, index) => [player.playerId, index]),
  );
  useLayoutEffect(() => {
    const queue = queueRef.current;
    if (!queue || !currentActor) return;

    const alignCurrentActor = () => {
      const actorCard = Array.from(
        queue.querySelectorAll<HTMLElement>('[data-mobile-queue-player-id]'),
      ).find(
        (element) =>
          element.dataset.mobileQueuePlayerId === currentActor.playerId,
      );
      if (!actorCard) return;

      const maxScrollLeft = Math.max(0, queue.scrollWidth - queue.clientWidth);
      const targetScrollLeft = Math.min(actorCard.offsetLeft, maxScrollLeft);
      if (queue.scrollTo) {
        queue.scrollTo({ left: targetScrollLeft, behavior: 'smooth' });
      } else {
        queue.scrollLeft = targetScrollLeft;
      }
    };

    alignCurrentActor();
    const retryId = window.setTimeout(alignCurrentActor, 0);
    return () => window.clearTimeout(retryId);
  }, [actionRoundKey, currentActor?.playerId]);
  const layout =
    desktopPlayers.length === 2
      ? 'heads-up'
      : desktopPlayers.length === 3
        ? 'three-handed'
        : 'multi-handed';
  const ownPlayer = orderedPlayers.find(
    (player) => player.playerId === ownPlayerId,
  );

  return (
    <div
      className="table-seats"
      data-layout={layout}
      data-player-count={desktopPlayers.length}
      role="list"
      aria-label={`${desktopPlayers.length} 人座位布局`}
    >
      <div className="table-seats__queue" ref={queueRef}>
        {orderedPlayers.map((player) => {
          const baseClasses = [
            'table-seat',
            `table-seat--${player.status}`,
            `table-seat--color-${player.seatIndex % 6}`,
            player.isCurrentActor ? 'table-seat--acting' : '',
          ];
          if (player.playerId === ownPlayerId) {
            return (
              <div
                className={[...baseClasses, 'table-seat--mobile-own-summary']
                  .filter(Boolean)
                  .join(' ')}
                key={player.playerId}
                role="listitem"
                aria-hidden="true"
                data-mobile-queue-player-id={player.playerId}
              >
                <div className="table-seat__content">
                  <SeatContents player={player} />
                </div>
              </div>
            );
          }

          return (
            <div
              className={baseClasses.filter(Boolean).join(' ')}
              key={player.playerId}
              role="listitem"
              data-player-id={player.playerId}
              data-seat-position={stablePosition.get(player.playerId) ?? 0}
              data-mobile-queue-player-id={player.playerId}
              style={positionFor(
                stablePosition.get(player.playerId) ?? 0,
                desktopPlayers.length,
              )}
              aria-current={player.isCurrentActor ? 'true' : undefined}
            >
              <div className="table-seat__content">
                <SeatContents player={player} />
              </div>
            </div>
          );
        })}
      </div>
      {ownPlayer ? (
        <div
          className={[
            'table-seat',
            `table-seat--${ownPlayer.status}`,
            `table-seat--color-${ownPlayer.seatIndex % 6}`,
            ownPlayer.isCurrentActor ? 'table-seat--acting' : '',
            'table-seat--own',
          ]
            .filter(Boolean)
            .join(' ')}
          role="listitem"
          data-player-id={ownPlayer.playerId}
          data-seat-position={stablePosition.get(ownPlayer.playerId) ?? 0}
          style={positionFor(
            stablePosition.get(ownPlayer.playerId) ?? 0,
            desktopPlayers.length,
            true,
          )}
          aria-current={ownPlayer.isCurrentActor ? 'true' : undefined}
        >
          <div className="table-seat__content">
            <SeatContents player={ownPlayer} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
