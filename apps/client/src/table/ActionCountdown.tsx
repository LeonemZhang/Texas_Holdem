import { useEffect, useState } from 'react';

export interface ActionCountdownProps {
  readonly deadlineMs: number;
  readonly actorName: string;
  readonly nowMs?: number;
}

function useCurrentTime(fixedNowMs?: number): number {
  const [liveNowMs, setLiveNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (fixedNowMs !== undefined) return undefined;
    const timer = window.setInterval(() => setLiveNowMs(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [fixedNowMs]);
  return fixedNowMs ?? liveNowMs;
}

export function ActionCountdown({
  deadlineMs,
  actorName,
  nowMs,
}: ActionCountdownProps) {
  const currentTime = useCurrentTime(nowMs);
  const secondsLeft = Math.max(
    0,
    Math.ceil((deadlineMs - currentTime) / 1_000),
  );

  return (
    <div
      className="poker-table__action-timer"
      aria-label={`${actorName} 行动剩余 ${secondsLeft} 秒`}
    >
      <span>轮到 {actorName}</span>
      <strong>{secondsLeft}s</strong>
    </div>
  );
}
