import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { PlayingCard, type StreetPotView } from '../table/CardsAndPots.js';

export interface HandReadyRequestView {
  readonly requestId: string;
  readonly requesterId: string;
  readonly requesterName: string;
  readonly targetPlayerId: string;
  readonly amount: number;
}

export interface ChipResetVoteView {
  readonly status?: 'failed';
  readonly initialChips: number;
  readonly insufficientPlayerNames: readonly string[];
  readonly ownVote: 'pending' | 'approve' | 'reject';
  readonly players: readonly {
    readonly playerId: string;
    readonly nickname: string;
    readonly vote: 'pending' | 'approve' | 'reject';
  }[];
}

export interface HandReadyOverlayProps {
  readonly spectator?: boolean;
  readonly ownPlayerId?: string;
  readonly deadlineMs: number;
  readonly ownChoice: 'pending' | 'ready' | 'sitting-out';
  readonly pendingRequests: readonly HandReadyRequestView[];
  readonly chipResetVote?: ChipResetVoteView | null;
  readonly complete: boolean;
  readonly ownChips: number;
  readonly bigBlind?: number;
  readonly nowMs?: number;
  readonly onChoose: (choice: 'ready' | 'sitting-out') => void;
  readonly onChipResetVote?: (vote: 'approve' | 'reject') => void;
  readonly onShowHoleCards?: () => void;
  readonly requestToReview?: HandReadyRequestView | null;
  readonly onApproveRequest?: (requestId: string) => void;
  readonly onRejectRequest?: (requestId: string) => void;
  readonly onSettlementCollapsedChange?: (collapsed: boolean) => void;
  readonly settlementCollapsed?: boolean;
  readonly settlement?: {
    readonly handId: string;
    /** The human-facing hand number for this settlement, not the opaque hand id. */
    readonly handNumber: number;
    readonly reason: 'uncontested' | 'showdown';
    readonly communityCards?: readonly string[];
    readonly totalPot?: number;
    readonly streetPots?: readonly StreetPotView[];
    readonly players: readonly {
      readonly playerId: string;
      readonly nickname: string;
      readonly chips: number;
      readonly netChange: number;
      readonly holeCards?: readonly string[];
      readonly bestFiveCards?: readonly string[];
      readonly voluntarilyRevealedHoleCards?: readonly string[];
      readonly handType?: string;
    }[];
  } | null;
}

const streetLabels: Record<StreetPotView['street'], string> = {
  preflop: '翻牌前',
  flop: '翻牌',
  turn: '转牌',
  river: '河牌',
};

const rankValues: Record<string, number> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

const suitValues: Record<string, number> = {
  s: 4,
  h: 3,
  d: 2,
  c: 1,
};

function cardRank(card: string) {
  return rankValues[card.slice(0, -1)] ?? 0;
}

function cardSuit(card: string) {
  return suitValues[card.slice(-1)] ?? 0;
}

const straightHandTypes = new Set([
  'straight',
  'straight-flush',
  '顺子',
  '同花顺',
]);

function isStraightHand(handType: string | undefined) {
  return handType !== undefined && straightHandTypes.has(handType);
}

/** Orders the already-authoritative best five for readable presentation only. */
export function sortBestFiveCards(cards: readonly string[], handType?: string) {
  const rankCounts = new Map<number, number>();
  for (const card of cards) {
    const rank = cardRank(card);
    rankCounts.set(rank, (rankCounts.get(rank) ?? 0) + 1);
  }

  const straightHighRank = isStraightHand(handType)
    ? Math.max(...rankCounts.keys()) === 14 && rankCounts.has(2)
      ? 5
      : Math.max(...rankCounts.keys())
    : null;

  return [...cards].sort((left, right) => {
    const leftRank = cardRank(left);
    const rightRank = cardRank(right);
    if (straightHighRank !== null) {
      const straightRank = (rank: number) =>
        straightHighRank === 5 && rank === 14 ? 1 : rank;
      return (
        straightRank(rightRank) - straightRank(leftRank) ||
        cardSuit(right) - cardSuit(left)
      );
    }

    const countDifference =
      (rankCounts.get(rightRank) ?? 0) - (rankCounts.get(leftRank) ?? 0);
    return (
      countDifference ||
      rightRank - leftRank ||
      cardSuit(right) - cardSuit(left)
    );
  });
}

function useCurrentTime(fixedNowMs?: number) {
  const [liveNowMs, setLiveNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (fixedNowMs !== undefined) return undefined;
    const timer = window.setInterval(() => setLiveNowMs(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [fixedNowMs]);
  return fixedNowMs ?? liveNowMs;
}

function settlementNetChangeClassName(netChange: number) {
  return netChange > 0
    ? 'hand-ready-card__net-change--positive'
    : netChange < 0
      ? 'hand-ready-card__net-change--negative'
      : 'hand-ready-card__net-change--tie';
}

export function HandReadyOverlay({
  spectator = false,
  ownPlayerId,
  deadlineMs,
  ownChoice,
  pendingRequests,
  complete,
  ownChips,
  bigBlind = 1,
  nowMs,
  onChoose,
  chipResetVote = null,
  onChipResetVote,
  onShowHoleCards,
  requestToReview = null,
  onApproveRequest,
  onRejectRequest,
  onSettlementCollapsedChange,
  settlementCollapsed: controlledSettlementCollapsed,
  settlement = null,
}: HandReadyOverlayProps) {
  const currentTime = useCurrentTime(nowMs);
  const [settlementCollapsed, setSettlementCollapsed] = useState(false);
  const [chipResetVoteCollapsed, setChipResetVoteCollapsed] = useState(false);
  const isSettlementCollapsed =
    controlledSettlementCollapsed === true || settlementCollapsed;
  const chipResetVoteStatus = chipResetVote
    ? chipResetVote.status === 'failed'
      ? 'failed'
      : 'active'
    : null;
  const chipResetVoteActive = chipResetVoteStatus === 'active';
  const chipResetVotePlayers = chipResetVote
    ? [
        ...chipResetVote.players.filter(
          (player) => player.playerId === ownPlayerId,
        ),
        ...chipResetVote.players.filter(
          (player) => player.playerId !== ownPlayerId,
        ),
      ]
    : [];
  const currentOwnChipResetVote = chipResetVote?.ownVote ?? null;
  const previousOwnChipResetVote = useRef<ChipResetVoteView['ownVote'] | null>(
    null,
  );
  const previousChipResetVoteStatus = useRef<typeof chipResetVoteStatus>(null);
  useEffect(() => {
    const previous = previousOwnChipResetVote.current;
    const previousStatus = previousChipResetVoteStatus.current;
    previousOwnChipResetVote.current = currentOwnChipResetVote;
    previousChipResetVoteStatus.current = chipResetVoteStatus;
    if (chipResetVoteStatus === null) {
      setChipResetVoteCollapsed(false);
    } else if (
      chipResetVoteStatus === 'active' &&
      previousStatus !== 'active'
    ) {
      setChipResetVoteCollapsed(false);
    } else if (
      chipResetVoteStatus === 'active' &&
      currentOwnChipResetVote === 'approve' &&
      (previous === null || previous === 'pending')
    ) {
      setChipResetVoteCollapsed(true);
    }
  }, [chipResetVoteStatus, currentOwnChipResetVote]);
  const handleChipResetVote = (vote: 'approve' | 'reject') => {
    onChipResetVote?.(vote);
  };
  const actionsHeaderRef = useRef<HTMLElement | null>(null);
  const settlementCommunityCards = settlement?.communityCards ?? [];
  const ownSettlementNetChange =
    settlement?.players.find((player) => player.playerId === ownPlayerId)
      ?.netChange ?? 0;
  const settlementOutcome =
    ownSettlementNetChange > 0
      ? 'win'
      : ownSettlementNetChange < 0
        ? 'loss'
        : 'tie';
  const settlementOutcomeLabel =
    settlementOutcome === 'win'
      ? '胜利'
      : settlementOutcome === 'loss'
        ? '失败'
        : '平局';
  const settlementTitle = settlement
    ? `第 ${settlement.handNumber} 局结算`
    : null;
  const settlementOutcomeClassName = settlementNetChangeClassName(
    ownSettlementNetChange,
  );
  const settlementPlayers = [
    ...(settlement?.players.filter(
      (player) => player.playerId === ownPlayerId,
    ) ?? []),
    ...(settlement?.players.filter(
      (player) => player.playerId !== ownPlayerId,
    ) ?? []),
  ].map((player) => ({
    ...player,
    displayName: player.playerId === ownPlayerId ? '我' : player.nickname,
  }));
  const secondsLeft = Math.max(
    0,
    Math.ceil((deadlineMs - currentTime) / 1_000),
  );

  useEffect(() => {
    setSettlementCollapsed(false);
    onSettlementCollapsedChange?.(false);
  }, [onSettlementCollapsedChange, settlement?.handId]);

  useLayoutEffect(() => {
    const header = actionsHeaderRef.current;
    if (!header) return;

    const updateActionScale = () => {
      const rootFontSize = Number.parseFloat(
        window.getComputedStyle(document.documentElement).fontSize,
      );
      const rem = Number.isFinite(rootFontSize) ? rootFontSize : 16;
      const actionCount = header.querySelectorAll(
        '.hand-ready-card__actions .button',
      ).length;
      const baseWidth =
        (4.75 +
          0.25 +
          actionCount * 4.9 +
          Math.max(0, actionCount - 1) * 0.25) *
        rem;
      const scale = Math.min(1, header.clientWidth / baseWidth);

      header.style.setProperty('--hand-ready-action-scale', `${scale}`);
      header.style.setProperty(
        '--hand-ready-action-gap',
        `${0.25 * rem * scale}px`,
      );
      header.style.setProperty(
        '--hand-ready-waiting-width',
        `${4.75 * rem * scale}px`,
      );
      header.style.setProperty(
        '--hand-ready-action-width',
        `${4.9 * rem * scale}px`,
      );
      header.style.setProperty(
        '--hand-ready-action-height',
        `${3.25 * rem * scale}px`,
      );
      header.style.setProperty(
        '--hand-ready-action-padding',
        `${0.4 * rem * scale}px`,
      );
      header.style.setProperty(
        '--hand-ready-action-font-size',
        `${0.8 * rem * scale}px`,
      );
      header.style.setProperty(
        '--hand-ready-waiting-font-size',
        `${0.76 * rem * scale}px`,
      );
    };

    updateActionScale();
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(updateActionScale);
    resizeObserver?.observe(header);
    return () => resizeObserver?.disconnect();
  });

  const collapseSettlement = () => {
    setSettlementCollapsed(true);
    onSettlementCollapsedChange?.(true);
  };

  if (complete || (spectator && !settlement)) return null;

  if (settlement && isSettlementCollapsed) {
    return (
      <section
        className="hand-ready-overlay hand-ready-overlay--collapsed"
        aria-label={spectator ? '观战结算' : '发牌前准备'}
      >
        <button
          className="hand-ready-card__settlement-expand"
          type="button"
          onClick={() => {
            setSettlementCollapsed(false);
            onSettlementCollapsedChange?.(false);
          }}
        >
          {spectator ? '公开结算详情' : `结算详情 · ${secondsLeft}s`}
        </button>
      </section>
    );
  }

  return (
    <section
      className={`hand-ready-overlay${spectator ? ' hand-ready-overlay--spectator' : ''}`}
      aria-label={spectator ? '观战结算' : '发牌前准备'}
    >
      <div className="hand-ready-card">
        {!spectator ? (
          <header ref={actionsHeaderRef}>
            <strong
              className={`hand-ready-card__timer${secondsLeft === 0 ? ' hand-ready-card__timer--waiting' : ''}`}
              aria-label={
                secondsLeft > 0
                  ? `剩余 ${secondsLeft} 秒`
                  : '等待至少两名玩家就绪'
              }
            >
              {secondsLeft > 0 ? `${secondsLeft}s` : '等待就绪'}
            </strong>
            <div
              className="hand-ready-card__actions"
              role="group"
              aria-label="准备操作"
            >
              <button
                className="button button--primary hand-ready-card__choice-button"
                type="button"
                disabled={
                  chipResetVoteActive ||
                  ownChoice === 'ready' ||
                  ownChips < bigBlind
                }
                onClick={() => onChoose('ready')}
              >
                {ownChoice === 'ready' ? '已就绪' : '就绪'}
              </button>
              {settlement && onShowHoleCards ? (
                <button
                  className="button hand-ready-card__show-hole-cards"
                  type="button"
                  onClick={onShowHoleCards}
                >
                  摊牌
                </button>
              ) : null}
              <button
                className="button button--secondary"
                type="button"
                disabled={chipResetVoteActive || ownChoice === 'sitting-out'}
                onClick={() => onChoose('sitting-out')}
              >
                暂不参与
              </button>
            </div>
          </header>
        ) : null}

        {!spectator && requestToReview ? (
          <section
            className="hand-ready-card__request-prompt"
            role="alertdialog"
            aria-label="筹码请求"
          >
            <strong>收到筹码请求</strong>
            <p>
              {requestToReview.requesterName} 请求{' '}
              {requestToReview.amount.toLocaleString('zh-CN')} 筹码
            </p>
            <div>
              <button
                className="button button--primary"
                type="button"
                onClick={() => onApproveRequest?.(requestToReview.requestId)}
              >
                同意
              </button>
              <button
                className="button button--secondary"
                type="button"
                onClick={() => onRejectRequest?.(requestToReview.requestId)}
              >
                拒绝
              </button>
            </div>
          </section>
        ) : null}

        {!spectator && chipResetVote ? (
          <section
            className="hand-ready-card__request-prompt hand-ready-card__request-prompt--chip-reset"
            role="alertdialog"
            aria-label="筹码重置投票"
          >
            <header className="hand-ready-card__vote-header">
              <strong>
                筹码重置投票
                {chipResetVoteStatus === 'failed' ? (
                  <span className="hand-ready-card__vote-result">失败</span>
                ) : null}
              </strong>
              <button
                className="button button--secondary hand-ready-card__vote-toggle"
                type="button"
                aria-expanded={!chipResetVoteCollapsed}
                aria-label={`${chipResetVoteCollapsed ? '展开' : '收起'}筹码重置投票`}
                onClick={() =>
                  setChipResetVoteCollapsed((collapsed) => !collapsed)
                }
              >
                {chipResetVoteCollapsed ? '展开' : '收起'}
              </button>
            </header>
            {!chipResetVoteCollapsed ? (
              <>
                <p>
                  {chipResetVoteStatus === 'failed' ? (
                    '本次投票失败，筹码未被重置。'
                  ) : (
                    <>
                      {chipResetVote.insufficientPlayerNames.length > 0
                        ? `${chipResetVote.insufficientPlayerNames.join('、')} 的剩余筹码不足以参加下一局。`
                        : '房主发起了筹码重置投票。'}{' '}
                      全员同意后，所有玩家筹码恢复为初始值（
                      {chipResetVote.initialChips.toLocaleString('zh-CN')}
                      ），本次重置不计入净输赢。
                    </>
                  )}
                </p>
                <table className="hand-ready-card__vote-table">
                  <tbody>
                    {chipResetVotePlayers.map((player) => {
                      const voteStatusClassName =
                        player.vote === 'approve'
                          ? 'hand-ready-card__vote-status hand-ready-card__vote-status--approved'
                          : player.vote === 'reject'
                            ? 'hand-ready-card__vote-status hand-ready-card__vote-status--rejected'
                            : 'hand-ready-card__vote-status';
                      const voteStatusLabel =
                        player.vote === 'approve'
                          ? '已同意'
                          : player.vote === 'reject'
                            ? '已拒绝'
                            : '待投票';
                      return (
                        <tr key={player.playerId}>
                          <th scope="row">
                            {player.playerId === ownPlayerId
                              ? '我'
                              : player.nickname}
                          </th>
                          <td>
                            <span className={voteStatusClassName}>
                              {voteStatusLabel}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div>
                  <button
                    className="button button--primary"
                    type="button"
                    disabled={
                      !chipResetVoteActive ||
                      chipResetVote.ownVote !== 'pending'
                    }
                    onClick={() => handleChipResetVote('approve')}
                  >
                    {chipResetVote.ownVote === 'approve' ? '已同意' : '同意'}
                  </button>
                  <button
                    className="button button--secondary"
                    type="button"
                    disabled={
                      !chipResetVoteActive ||
                      chipResetVote.ownVote !== 'pending'
                    }
                    onClick={() => handleChipResetVote('reject')}
                  >
                    拒绝
                  </button>
                </div>
              </>
            ) : null}
          </section>
        ) : null}

        {settlement ? (
          <section
            className="hand-ready-card__settlement"
            role="alertdialog"
            aria-label={settlementTitle ?? undefined}
          >
            <div className="hand-ready-card__settlement-heading">
              <strong className="hand-ready-card__settlement-title">
                {settlementTitle}
                {settlement.reason === 'showdown' ? ' · 摊牌' : ''}
              </strong>
              {spectator ? (
                <strong className="hand-ready-card__settlement-outcome">
                  公开信息
                </strong>
              ) : (
                <strong
                  className={`hand-ready-card__settlement-outcome ${settlementOutcomeClassName}`}
                >
                  {settlementOutcomeLabel}
                </strong>
              )}
              <button
                className="hand-ready-card__settlement-collapse"
                type="button"
                aria-label="收起结算详情"
                onClick={collapseSettlement}
              >
                收起
              </button>
            </div>
            <section
              className="hand-ready-card__settlement-table-summary"
              aria-label="本局牌面与底池"
            >
              {settlementCommunityCards.length > 0 ? (
                <div
                  className="hand-ready-card__settlement-community-cards"
                  aria-label="本局公共牌"
                >
                  <span className="hand-ready-card__card-label">公共牌</span>
                  <div className="hand-ready-card__card-row">
                    {settlementCommunityCards.map((card, index) => (
                      <PlayingCard
                        code={card}
                        key={`${card}-${index}`}
                        label={`本局第 ${index + 1} 张公共牌`}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
              <dl
                className="hand-ready-card__settlement-pots"
                aria-label="本局结算底池"
              >
                <div>
                  <dt>总池</dt>
                  <dd>{(settlement.totalPot ?? 0).toLocaleString('zh-CN')}</dd>
                </div>
                {(settlement.streetPots ?? []).map((pot) => (
                  <div key={pot.street}>
                    <dt>{streetLabels[pot.street]}</dt>
                    <dd>{pot.amount.toLocaleString('zh-CN')}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <ul
              className="hand-ready-card__showdown-results"
              aria-label="本局结算玩家牌型"
            >
              {settlementPlayers.map((player) => (
                <li key={player.playerId}>
                  <div className="hand-ready-card__showdown-summary">
                    <strong>{player.displayName}</strong>
                    <span className="hand-ready-card__player-chips">
                      · {player.chips.toLocaleString('zh-CN')} 筹码
                    </span>
                    <span
                      className={settlementNetChangeClassName(player.netChange)}
                    >
                      {player.netChange > 0
                        ? `赢得 ${player.netChange.toLocaleString('zh-CN')} 筹码`
                        : player.netChange < 0
                          ? `输掉 ${Math.abs(player.netChange).toLocaleString('zh-CN')} 筹码`
                          : '持平'}
                    </span>
                  </div>
                  <div className="hand-ready-card__settlement-cards">
                    <div aria-label={`${player.displayName} 的底牌`}>
                      <span className="hand-ready-card__card-label">底牌</span>
                      {player.holeCards ? (
                        player.holeCards.map((card, index) => (
                          <PlayingCard
                            code={card}
                            key={`${card}-${index}`}
                            label={`${player.displayName} 的第 ${index + 1} 张底牌`}
                          />
                        ))
                      ) : player.voluntarilyRevealedHoleCards ? (
                        player.voluntarilyRevealedHoleCards.map(
                          (card, index) => (
                            <PlayingCard
                              code={card}
                              key={`${card}-${index}`}
                              label={`${player.displayName} 的公开第 ${index + 1} 张底牌`}
                            />
                          ),
                        )
                      ) : (
                        <>
                          <PlayingCard
                            code={null}
                            label={`${player.displayName} 的第 1 张底牌`}
                          />
                          <PlayingCard
                            code={null}
                            label={`${player.displayName} 的第 2 张底牌`}
                          />
                        </>
                      )}
                    </div>
                    {player.bestFiveCards ? (
                      <div
                        aria-label={`${player.displayName} 的${player.handType ?? '牌型'}`}
                      >
                        <span className="hand-ready-card__card-label">
                          {player.handType ?? '牌型'}
                        </span>
                        {sortBestFiveCards(
                          player.bestFiveCards,
                          player.handType,
                        ).map((card, index) => (
                          <PlayingCard
                            code={card}
                            key={`${card}-${index}`}
                            label={`${player.displayName} 的最佳第 ${index + 1} 张牌`}
                          />
                        ))}
                      </div>
                    ) : null}
                    {!player.holeCards &&
                    !player.voluntarilyRevealedHoleCards ? (
                      <span className="hand-ready-card__showdown-status">
                        未摊牌
                      </span>
                    ) : null}
                    {player.voluntarilyRevealedHoleCards &&
                    !player.holeCards ? (
                      <span className="hand-ready-card__showdown-status">
                        主动摊牌
                      </span>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!spectator && pendingRequests.length > 0 ? (
          <div className="hand-ready-card__requests" role="status">
            <strong>尚有筹码请求待处理</strong>
            <ul>
              {pendingRequests.map((request) => (
                <li key={request.requestId}>
                  {request.requesterName} 请求{' '}
                  {request.amount.toLocaleString('zh-CN')} 筹码
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}
