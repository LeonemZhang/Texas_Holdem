import { useState } from 'react';

import type { LegalActions } from '@texas-holdem/protocol';

export type BettingActionIntent =
  | { readonly type: 'game.fold' }
  | { readonly type: 'game.check' }
  | { readonly type: 'game.call' }
  | { readonly type: 'game.raise-to'; readonly amount: number }
  | { readonly type: 'game.all-in' };

export interface BettingControlsProps {
  readonly legalActions: LegalActions | null;
  readonly disabled?: boolean;
  readonly onAction: (action: BettingActionIntent) => void;
}

export function BettingControls({
  legalActions,
  disabled = false,
  onAction,
}: BettingControlsProps) {
  const minimum = legalActions?.minimumRaiseTo ?? 0;
  const maximum = legalActions?.maximumRaiseTo ?? minimum;
  const [raiseTo, setRaiseTo] = useState(minimum);
  const effectiveRaiseTo = Math.min(maximum, Math.max(minimum, raiseTo));
  const locked = disabled || legalActions === null;
  const canRaise = !locked && minimum > 0 && maximum >= minimum;

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
        <label htmlFor="raise-to">加注到</label>
        <input
          id="raise-to"
          type="range"
          min={minimum}
          max={maximum}
          value={effectiveRaiseTo}
          disabled={!canRaise}
          onChange={(event) => setRaiseTo(Number(event.target.value))}
        />
        <output htmlFor="raise-to">{effectiveRaiseTo}</output>
        <span className="raise-control__range">
          最小 {minimum} · 最大 {maximum}
        </span>
        <button
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
