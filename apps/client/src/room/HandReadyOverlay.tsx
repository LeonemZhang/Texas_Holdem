import { useEffect, useState } from 'react';

import { PlayingCard, type StreetPotView } from '../table/CardsAndPots.js';

export interface HandReadyRequestView {
  readonly requestId: string;
  readonly requesterId: string;
  readonly requesterName: string;
  readonly targetPlayerId: string;
  readonly amount: number;
}

export interface HandReadyOverlayProps {
  readonly ownPlayerId?: string;
  readonly deadlineMs: number;
  readonly ownChoice: 'pending' | 'ready' | 'sitting-out';
  readonly pendingRequests: readonly HandReadyRequestView[];
  readonly complete: boolean;
  readonly ownChips: number;
  readonly bigBlind?: number;
  readonly nowMs?: number;
  readonly onChoose: (choice: 'ready' | 'sitting-out') => void;
  readonly onShowHoleCards?: () => void;
  readonly requestToReview?: HandReadyRequestView | null;
  readonly onApproveRequest?: (requestId: string) => void;
  readonly onRejectRequest?: (requestId: string) => void;
  readonly onSettlementCollapsedChange?: (collapsed: boolean) => void;
  readonly settlement?: {
    readonly handId: string;
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
  ownPlayerId,
  deadlineMs,
  ownChoice,
  pendingRequests,
  complete,
  ownChips,
  bigBlind = 1,
  nowMs,
  onChoose,
  onShowHoleCards,
  requestToReview = null,
  onApproveRequest,
  onRejectRequest,
  onSettlementCollapsedChange,
  settlement = null,
}: HandReadyOverlayProps) {
  const currentTime = useCurrentTime(nowMs);
  const [settlementCollapsed, setSettlementCollapsed] = useState(false);
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

  const collapseSettlement = () => {
    setSettlementCollapsed(true);
    onSettlementCollapsedChange?.(true);
  };

  if (complete) return null;

  if (settlement && settlementCollapsed) {
    return (
      <section
        className="hand-ready-overlay hand-ready-overlay--collapsed"
        aria-label="发牌前准备"
      >
        <button
          className="hand-ready-card__settlement-expand"
          type="button"
          onClick={() => {
            setSettlementCollapsed(false);
            onSettlementCollapsedChange?.(false);
          }}
        >
          结算详情 · {secondsLeft}s
        </button>
      </section>
    );
  }

  return (
    <section className="hand-ready-overlay" aria-label="发牌前准备">
      <div className="hand-ready-card">
        <header>
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
              className={`button button--primary hand-ready-card__choice-button${
                ownChoice === 'sitting-out'
                  ? ' hand-ready-card__choice-button--join'
                  : ''
              }`}
              type="button"
              disabled={ownChoice === 'ready' || ownChips < bigBlind}
              onClick={() => onChoose('ready')}
            >
              {ownChoice === 'ready'
                ? '已就绪'
                : ownChoice === 'sitting-out'
                  ? '加入下一局'
                  : '就绪'}
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
              disabled={ownChoice === 'sitting-out'}
              onClick={() => onChoose('sitting-out')}
            >
              暂不参与
            </button>
          </div>
        </header>

        {requestToReview ? (
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

        {settlement ? (
          <section
            className="hand-ready-card__settlement"
            role="alertdialog"
            aria-label="本局结算"
          >
            <div className="hand-ready-card__settlement-heading">
              <strong className="hand-ready-card__settlement-title">
                本局结算{settlement.reason === 'showdown' ? ' · 摊牌' : ''}
              </strong>
              <strong
                className={`hand-ready-card__settlement-outcome ${settlementOutcomeClassName}`}
              >
                {settlementOutcomeLabel}
              </strong>
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

        {pendingRequests.length > 0 ? (
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
