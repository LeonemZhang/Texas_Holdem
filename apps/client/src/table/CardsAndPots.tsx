import { useLayoutEffect, useRef } from 'react';

export interface StreetPotView {
  readonly street: 'preflop' | 'flop' | 'turn' | 'river';
  readonly amount: number;
}

export interface CardsAndPotsProps {
  readonly communityCards: readonly string[];
  readonly totalPot: number;
  readonly streetPots: readonly StreetPotView[];
  readonly currentStreet?: StreetPotView['street'] | 'settled' | undefined;
  readonly ownHoleCards?: readonly string[] | null;
  readonly ownHandType?: string | null;
  readonly showdownHands?: readonly {
    readonly playerId: string;
    readonly nickname: string;
    readonly cards: readonly string[];
  }[];
}

const suitSymbols: Record<string, string> = {
  c: '♣',
  d: '♦',
  h: '♥',
  s: '♠',
};

const streetLabels: Record<StreetPotView['street'], string> = {
  preflop: '翻牌前',
  flop: '翻牌',
  turn: '转牌',
  river: '河牌',
};

export function PlayingCard({
  code,
  label,
}: {
  readonly code: string | null;
  readonly label: string;
}) {
  if (!code) {
    return (
      <span
        className="playing-card playing-card--back"
        aria-label={`${label}，未公开`}
      />
    );
  }
  const rank = code.slice(0, -1);
  const displayedRank = rank === 'T' ? '10' : rank;
  const suit = code.slice(-1);
  const red = suit === 'd' || suit === 'h';
  return (
    <span
      className={`playing-card${red ? ' playing-card--red' : ''}`}
      aria-label={`${label} ${displayedRank}${suitSymbols[suit] ?? suit}`}
    >
      <strong>{displayedRank}</strong>
      <span>{suitSymbols[suit] ?? suit}</span>
    </span>
  );
}

export function CardsAndPots({
  communityCards,
  totalPot,
  streetPots,
  currentStreet,
  ownHoleCards = null,
  ownHandType = null,
  showdownHands = [],
}: CardsAndPotsProps) {
  const potHistoryRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const history = potHistoryRef.current;
    const content = history?.querySelector<HTMLElement>(
      '.street-pot-history__content',
    );
    const mobileQuery = window.matchMedia?.(
      '(max-width: 599px), (min-width: 600px) and (max-aspect-ratio: 5/6)',
    );
    if (!history || !content || !mobileQuery) return;

    const measure = () => {
      history.style.setProperty('--street-pot-history-scale', '1');
      history.style.setProperty('--street-pot-history-offset-x', '0px');
      const historyRect = history.getBoundingClientRect();
      if (!mobileQuery.matches || historyRect.width <= 0) return;

      const firstItem = content.firstElementChild;
      const lastItem = content.lastElementChild;
      if (
        !(firstItem instanceof HTMLElement) ||
        !(lastItem instanceof HTMLElement)
      ) {
        return;
      }

      const firstItemRect = firstItem.getBoundingClientRect();
      const lastItemRect = lastItem.getBoundingClientRect();
      const contentWidth = lastItemRect.right - firstItemRect.left;
      if (contentWidth <= historyRect.width + 1) return;

      const availableWidth = historyRect.width;
      const scale = Math.max(
        0.76,
        Math.min(0.9, availableWidth / contentWidth),
      );
      history.style.setProperty('--street-pot-history-scale', `${scale}`);

      const scaledContentWidth = contentWidth * scale;
      if (scaledContentWidth <= availableWidth + 1) {
        const firstItemOffset = firstItemRect.left - historyRect.left;
        const renderScale =
          history.clientWidth > 0 ? historyRect.width / history.clientWidth : 1;
        const offsetX =
          ((availableWidth - scaledContentWidth) / 2 -
            firstItemOffset * scale) /
          renderScale;
        history.style.setProperty(
          '--street-pot-history-offset-x',
          `${Math.max(0, offsetX)}px`,
        );
      }
    };

    measure();
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measure);
    resizeObserver?.observe(history);
    window.addEventListener('resize', measure);
    mobileQuery.addEventListener?.('change', measure);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', measure);
      mobileQuery.removeEventListener?.('change', measure);
    };
  }, [streetPots, totalPot]);

  const hasCurrentStreetPot = streetPots.some(
    (pot) => pot.street === currentStreet,
  );
  return (
    <div className="cards-and-pots">
      <div className="cards-and-pots__board">
        <div className="community-cards" aria-label="公共牌牌面">
          {Array.from({ length: 5 }, (_, index) => (
            <PlayingCard
              code={communityCards[index] ?? null}
              key={index}
              label={`第 ${index + 1} 张公共牌`}
            />
          ))}
        </div>

        <div className="cards-and-pots__pot-summary">
          <div
            className="street-pot-history"
            role="group"
            aria-label="本局底池"
            ref={potHistoryRef}
          >
            <dl className="street-pot-history__content">
              <div
                className="street-pot-history__total"
                data-pot-target={hasCurrentStreetPot ? undefined : true}
              >
                <dt>总池</dt>
                <dd>{totalPot.toLocaleString('zh-CN')}</dd>
              </div>
              {streetPots.map((pot) => (
                <div
                  className={
                    pot.street === currentStreet
                      ? 'street-pot-history__street street-pot-history__street--current'
                      : 'street-pot-history__street'
                  }
                  data-pot-target={
                    pot.street === currentStreet ? true : undefined
                  }
                  key={pot.street}
                >
                  <dt>{streetLabels[pot.street]}</dt>
                  <dd>{pot.amount.toLocaleString('zh-CN')}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </div>

      {showdownHands.length > 0 ? (
        <ul className="showdown-hands" aria-label="摊牌玩家手牌">
          {showdownHands.map((hand) => (
            <li key={hand.playerId}>
              <strong>{hand.nickname}</strong>
              <div aria-label={`${hand.nickname} 的底牌`}>
                {hand.cards.map((card, index) => (
                  <PlayingCard
                    code={card}
                    key={`${card}-${index}`}
                    label={`${hand.nickname} 的第 ${index + 1} 张底牌`}
                  />
                ))}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="hole-cards" aria-label="我的底牌">
          {ownHandType ? (
            <span
              className="hole-cards__hand-type"
              aria-label={`当前最大牌型：${ownHandType}`}
            >
              {ownHandType}
            </span>
          ) : null}
          <div className="hole-cards__cards">
            <PlayingCard
              code={ownHoleCards?.[0] ?? null}
              label="我的第一张底牌"
            />
            <PlayingCard
              code={ownHoleCards?.[1] ?? null}
              label="我的第二张底牌"
            />
          </div>
        </div>
      )}
    </div>
  );
}
