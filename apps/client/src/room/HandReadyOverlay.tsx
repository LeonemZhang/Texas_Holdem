import { useEffect, useState } from 'react';

export interface HandReadyRequestView {
  readonly requestId: string;
  readonly requesterId: string;
  readonly requesterName: string;
  readonly targetPlayerId: string | null;
  readonly amount: number;
}

export interface HandReadyOverlayProps {
  readonly deadlineMs: number;
  readonly ownChoice: 'pending' | 'ready' | 'sitting-out';
  readonly pendingRequests: readonly HandReadyRequestView[];
  readonly complete: boolean;
  readonly nowMs?: number;
  readonly onChoose: (choice: 'ready' | 'sitting-out') => void;
  readonly requestToReview?: HandReadyRequestView | null;
  readonly onApproveRequest?: (requestId: string) => void;
  readonly onRejectRequest?: (requestId: string) => void;
  readonly settlement?: {
    readonly handId: string;
    readonly reason: 'uncontested' | 'showdown';
    readonly winners: readonly {
      readonly nickname: string;
      readonly payout: number;
    }[];
  } | null;
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

export function HandReadyOverlay({
  deadlineMs,
  ownChoice,
  pendingRequests,
  complete,
  nowMs,
  onChoose,
  requestToReview = null,
  onApproveRequest,
  onRejectRequest,
  settlement = null,
}: HandReadyOverlayProps) {
  const [expanded, setExpanded] = useState(false);
  const [dismissedSettlementHandId, setDismissedSettlementHandId] = useState<
    string | null
  >(null);
  const currentTime = useCurrentTime(nowMs);
  const secondsLeft = Math.max(
    0,
    Math.ceil((deadlineMs - currentTime) / 1_000),
  );

  if (complete) return null;

  return (
    <section className="hand-ready-overlay" aria-labelledby="hand-ready-title">
      <div className="hand-ready-card">
        <header>
          <div>
            <h2
              id="hand-ready-title"
              className={expanded ? undefined : 'sr-only'}
            >
              下一手准备
            </h2>
            {expanded ? (
              <p className="connection-home__kicker">发牌前准备</p>
            ) : null}
          </div>
          <strong
            className="hand-ready-card__timer"
            aria-label={`剩余 ${secondsLeft} 秒`}
          >
            {secondsLeft}s
          </strong>
          <button
            className="button button--primary"
            type="button"
            disabled={pendingRequests.length > 0}
            onClick={() => onChoose('ready')}
          >
            就绪
          </button>
          <button
            className="hand-ready-card__details"
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((current) => !current)}
          >
            {expanded ? '收起详情' : '准备详情'}
          </button>
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

        {settlement && dismissedSettlementHandId !== settlement.handId ? (
          <section
            className="hand-ready-card__settlement"
            role="alertdialog"
            aria-label="本手结算"
          >
            <strong>
              本手结算{settlement.reason === 'showdown' ? ' · 摊牌' : ''}
            </strong>
            <ul>
              {settlement.winners.map(({ nickname, payout }) => (
                <li key={nickname}>
                  {nickname} 赢得 {payout.toLocaleString('zh-CN')} 筹码
                </li>
              ))}
            </ul>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => setDismissedSettlementHandId(settlement.handId)}
            >
              知道了
            </button>
          </section>
        ) : null}

        {expanded && pendingRequests.length > 0 ? (
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

        {expanded ? (
          <p className="hand-ready-card__choice">
            当前选择：
            <strong>
              {ownChoice === 'pending'
                ? '尚未选择'
                : ownChoice === 'ready'
                  ? '已就绪'
                  : '下一手暂不参与'}
            </strong>
          </p>
        ) : null}
        {expanded ? (
          <div className="hand-ready-card__actions">
            <button
              className="button button--secondary"
              type="button"
              onClick={() => onChoose('sitting-out')}
            >
              下一手暂不参与
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
