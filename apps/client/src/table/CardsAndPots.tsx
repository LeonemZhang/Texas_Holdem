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
  showdownHands = [],
}: CardsAndPotsProps) {
  return (
    <div className="cards-and-pots">
      <div className="community-cards" aria-label="公共牌牌面">
        {Array.from({ length: 5 }, (_, index) => (
          <PlayingCard
            code={communityCards[index] ?? null}
            key={index}
            label={`第 ${index + 1} 张公共牌`}
          />
        ))}
      </div>

      <dl className="street-pot-history" aria-label="本手底池">
        <div className="street-pot-history__total" data-pot-target>
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
            key={pot.street}
          >
            <dt>{streetLabels[pot.street]}</dt>
            <dd>{pot.amount.toLocaleString('zh-CN')}</dd>
          </div>
        ))}
      </dl>

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
          <PlayingCard
            code={ownHoleCards?.[0] ?? null}
            label="我的第一张底牌"
          />
          <PlayingCard
            code={ownHoleCards?.[1] ?? null}
            label="我的第二张底牌"
          />
        </div>
      )}
    </div>
  );
}
