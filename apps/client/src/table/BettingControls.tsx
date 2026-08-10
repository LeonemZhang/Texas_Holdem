import { useEffect, useState, type CSSProperties } from 'react';

import type { LegalActions } from '@texas-holdem/protocol';

export type BettingActionIntent =
  | { readonly type: 'game.fold' }
  | { readonly type: 'game.check' }
  | { readonly type: 'game.call' }
  | { readonly type: 'game.raise-to'; readonly amount: number }
  | { readonly type: 'game.all-in' };

export interface BettingControlsProps {
  readonly legalActions: LegalActions | null;
  /** 本人本轮已经投入的筹码，由服务端房间快照提供。 */
  readonly streetCommitted?: number;
  readonly disabled?: boolean;
  readonly onAction: (action: BettingActionIntent) => void;
}

export function BettingControls({
  legalActions,
  streetCommitted = 0,
  disabled = false,
  onAction,
}: BettingControlsProps) {
  const minimum = legalActions?.minimumRaiseTo ?? 0;
  const maximum = legalActions?.maximumRaiseTo ?? minimum;
  const maximumIncrement = Math.max(0, maximum - minimum);
  const [raiseIncrement, setRaiseIncrement] = useState(0);
  const [raiseOpen, setRaiseOpen] = useState(false);
  const effectiveRaiseTo = minimum + Math.min(maximumIncrement, raiseIncrement);
  const effectiveRaiseAdditional = Math.max(
    legalActions?.callAmount ?? 0,
    effectiveRaiseTo - Math.max(0, streetCommitted),
  );
  const locked = disabled || legalActions === null;
  const canRaise = !locked && minimum > 0 && maximum >= minimum;
  const sliderPercent =
    maximumIncrement > 0
      ? (Math.min(maximumIncrement, raiseIncrement) / maximumIncrement) * 100
      : 0;
  const quickChipValues = [1, 2, 5, 10, 20, 50, 100] as const;
  const submitRaise = () => {
    if (!canRaise) return;
    onAction({ type: 'game.raise-to', amount: effectiveRaiseTo });
    setRaiseOpen(false);
  };

  useEffect(() => {
    setRaiseIncrement((current) =>
      Math.min(maximumIncrement, Math.max(0, current)),
    );
  }, [maximumIncrement]);

  const callAmount = legalActions?.callAmount;
  const callDigits =
    callAmount == null ? 0 : String(Math.max(0, callAmount)).length;
  const callWidth =
    callDigits >= 5 ? 'extra-wide' : callDigits >= 4 ? 'wide' : 'normal';

  return (
    <div
      className="betting-controls"
      aria-busy={disabled}
      data-call-width={callWidth}
    >
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
          className="betting-controls__call"
          type="button"
          aria-label={
            legalActions?.callAmount !== null
              ? `跟注 ${legalActions?.callAmount ?? 0}`
              : '跟注'
          }
          disabled={locked || legalActions?.callAmount === null}
          onClick={() => onAction({ type: 'game.call' })}
        >
          <span>跟注</span>
          {legalActions?.callAmount !== null ? (
            <span className="betting-controls__call-amount">
              {legalActions?.callAmount ?? 0}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          disabled={locked || !legalActions?.canAllIn}
          onClick={() => onAction({ type: 'game.all-in' })}
        >
          全押
        </button>
      </div>

      <div className="betting-controls__raise-actions">
        <button
          className="betting-controls__raise-toggle"
          type="button"
          aria-expanded={raiseOpen}
          aria-controls="raise-control-sheet"
          disabled={!canRaise}
          onClick={() => setRaiseOpen((current) => !current)}
        >
          调整加注到 {effectiveRaiseTo}
        </button>
        <button
          className="betting-controls__raise-submit"
          type="button"
          disabled={!canRaise}
          onClick={submitRaise}
        >
          确认加注到 {effectiveRaiseTo}
        </button>
      </div>

      <div
        id="raise-control-sheet"
        className={`raise-control${raiseOpen ? ' raise-control--open' : ''}`}
      >
        <header className="raise-control__sheet-header">
          <strong>加注设置</strong>
          <button
            type="button"
            aria-label="收起加注设置"
            disabled={!raiseOpen}
            onClick={() => setRaiseOpen(false)}
          >
            收起
          </button>
        </header>
        <div className="raise-control__bar">
          <div className="raise-control__slider">
            <output
              className="raise-control__value"
              htmlFor="raise-increment"
              style={
                {
                  '--raise-percent': `${sliderPercent}%`,
                } as CSSProperties
              }
            >
              {effectiveRaiseTo}
            </output>
            <input
              id="raise-increment"
              type="range"
              aria-label="加注增量"
              min="0"
              max={maximumIncrement}
              value={raiseIncrement}
              disabled={!canRaise}
              onChange={(event) =>
                setRaiseIncrement(Number(event.target.value))
              }
            />
          </div>
          <div className="raise-control__marks" aria-hidden="true">
            <span>最小 {minimum}</span>
            <span className="raise-control__additional">
              追加 {effectiveRaiseAdditional}
            </span>
            <span>最大 {maximum}</span>
          </div>
        </div>
        <div
          className="raise-control__quick-chips raise-control__quick-chips--positive"
          aria-label="加筹码快捷选项"
        >
          {quickChipValues.map((value) => (
            <button
              className={`poker-chip poker-chip--${value}`}
              key={value}
              type="button"
              aria-label={`增加 ${value} 筹码`}
              disabled={!canRaise || effectiveRaiseTo >= maximum}
              onClick={() =>
                setRaiseIncrement((current) => {
                  const currentRaiseTo = Math.min(
                    maximum,
                    minimum + Math.max(0, current),
                  );
                  const nextRaiseTo =
                    currentRaiseTo < value ? value : currentRaiseTo + value;
                  return Math.min(
                    maximumIncrement,
                    Math.max(0, nextRaiseTo - minimum),
                  );
                })
              }
            >
              <span className="poker-chip__disc" aria-hidden="true">
                <span className="poker-chip__value">+{value}</span>
              </span>
            </button>
          ))}
        </div>
        <div
          className="raise-control__quick-chips raise-control__quick-chips--negative"
          aria-label="减筹码快捷选项"
        >
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
              <span className="poker-chip__disc" aria-hidden="true">
                <span className="poker-chip__value poker-chip__value--negative">
                  −{value}
                </span>
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
          className="raise-control__confirm betting-controls__call"
          type="button"
          aria-label={`确认加注到 ${effectiveRaiseTo}`}
          disabled={!canRaise}
          onClick={submitRaise}
        >
          <span>确认加注到</span>
          <span className="betting-controls__call-amount">
            {effectiveRaiseTo}
          </span>
        </button>
      </div>
    </div>
  );
}
