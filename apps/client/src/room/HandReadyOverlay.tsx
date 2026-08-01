import { useEffect, useState } from 'react';

export interface HandReadyRequestView {
  readonly requestId: string;
  readonly requesterName: string;
  readonly amount: number;
}

export interface HandReadyOverlayProps {
  readonly deadlineMs: number;
  readonly ownChoice: 'pending' | 'ready' | 'sitting-out';
  readonly pendingRequests: readonly HandReadyRequestView[];
  readonly complete: boolean;
  readonly nowMs?: number;
  readonly onChoose: (choice: 'ready' | 'sitting-out') => void;
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
}: HandReadyOverlayProps) {
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
            <p className="connection-home__kicker">发牌前准备</p>
            <h2 id="hand-ready-title">下一手将在准备完成后开始</h2>
          </div>
          <strong
            className="hand-ready-card__timer"
            aria-label={`剩余 ${secondsLeft} 秒`}
          >
            {secondsLeft}s
          </strong>
        </header>

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
        <div className="hand-ready-card__actions">
          <button
            className="button button--primary"
            type="button"
            disabled={pendingRequests.length > 0}
            onClick={() => onChoose('ready')}
          >
            就绪
          </button>
          <button
            className="button button--secondary"
            type="button"
            onClick={() => onChoose('sitting-out')}
          >
            下一手暂不参与
          </button>
        </div>
      </div>
    </section>
  );
}
