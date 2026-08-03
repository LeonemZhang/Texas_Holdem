import { useEffect, useState } from 'react';

import type { LegalActions } from '@texas-holdem/protocol';

export type BettingActionIntent =
  | { readonly type: 'game.fold' }
  | { readonly type: 'game.check' }
  | { readonly type: 'game.call' }
  | { readonly type: 'game.raise-to'; readonly amount: number }
  | { readonly type: 'game.all-in' };

export interface BettingControlsProps {
  readonly legalActions: LegalActions | null;
  readonly roundContribution?: number;
  readonly handContribution?: number;
  readonly currentRoundBet?: number;
  readonly disabled?: boolean;
  readonly onAction: (action: BettingActionIntent) => void;
}

export function BettingControls({
  legalActions,
  roundContribution = 0,
  handContribution = 0,
  currentRoundBet = 0,
  disabled = false,
  onAction,
}: BettingControlsProps) {
  const minimum = legalActions?.minimumRaiseTo ?? 0;
  const maximum = legalActions?.maximumRaiseTo ?? minimum;
  const maximumIncrement = Math.max(0, maximum - minimum);
  const [raiseIncrement, setRaiseIncrement] = useState(0);
  const effectiveRaiseTo = minimum + Math.min(maximumIncrement, raiseIncrement);
  const locked = disabled || legalActions === null;
  const canRaise = !locked && minimum > 0 && maximum >= minimum;
  const quickChipValues = [1, 2, 5, 10, 20, 50, 100] as const;

  useEffect(() => {
    setRaiseIncrement((current) =>
      Math.min(maximumIncrement, Math.max(0, current)),
    );
  }, [maximumIncrement]);

  return (
    <div className="betting-controls" aria-busy={disabled}>
      <div className="betting-controls__primary">
        <button
          type="button"
          disabled={locked || !legalActions?.canFold}
          onClick={() => onAction({ type: 'game.fold' })}
        >
          弃牌
        </button>
        <button
          type="button"
          disabled={locked || !legalActions?.canCheck}
          onClick={() => onAction({ type: 'game.check' })}
        >
          过牌
        </button>
        <button
          type="button"
          disabled={locked || legalActions?.callAmount === null}
          onClick={() => onAction({ type: 'game.call' })}
        >
          跟注
          {legalActions?.callAmount !== null
            ? ` ${legalActions?.callAmount ?? 0}`
            : ''}
        </button>
        <button
          type="button"
          disabled={locked || !legalActions?.canAllIn}
          onClick={() => onAction({ type: 'game.all-in' })}
        >
          全押
        </button>
      </div>

      <div className="raise-control">
        <label htmlFor="raise-increment">加注增量</label>
        <input
          id="raise-increment"
          type="range"
          min="0"
          max={maximumIncrement}
          value={raiseIncrement}
          disabled={!canRaise}
          onChange={(event) => setRaiseIncrement(Number(event.target.value))}
        />
        <output htmlFor="raise-increment">加注至 {effectiveRaiseTo}</output>
        <span className="raise-control__range">
          最小 {minimum} · 最大 {maximum}
        </span>
        <div className="raise-control__summary" aria-label="本手投注信息">
          <span>本轮已投 {roundContribution}</span>
          <span>本手累计 {handContribution}</span>
          <span>本轮最高 {currentRoundBet}</span>
        </div>
        <div className="raise-control__quick-chips" aria-label="加筹码快捷选项">
          {quickChipValues.map((value) => (
            <button
              className={`poker-chip poker-chip--${value}`}
              key={value}
              type="button"
              aria-label={`增加 ${value} 筹码`}
              disabled={!canRaise || effectiveRaiseTo >= maximum}
              onClick={() =>
                setRaiseIncrement((current) =>
                  Math.min(maximumIncrement, Math.max(0, current) + value),
                )
              }
            >
              <span className="poker-chip__value" aria-hidden="true">
                {value}
              </span>
            </button>
          ))}
        </div>
        <div className="raise-control__quick-chips" aria-label="减筹码快捷选项">
          {quickChipValues.map((value) => (
            <button
              className={`poker-chip poker-chip--${value}`}
              key={value}
              type="button"
              aria-label={`减少 ${value} 筹码`}
              disabled={!canRaise || raiseIncrement === 0}
              onClick={() =>
                setRaiseIncrement((current) => Math.max(0, current - value))
              }
            >
              <span className="poker-chip__value" aria-hidden="true">
                −{value}
              </span>
            </button>
          ))}
        </div>
        <button
          className="raise-control__clear"
          type="button"
          disabled={!canRaise || raiseIncrement === 0}
          onClick={() => setRaiseIncrement(0)}
        >
          清零
        </button>
        <button
          className="raise-control__confirm"
          type="button"
          disabled={!canRaise}
          onClick={() =>
            onAction({ type: 'game.raise-to', amount: effectiveRaiseTo })
          }
        >
          确认加注
        </button>
      </div>
    </div>
  );
}
