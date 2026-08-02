export interface PotView {
  readonly amount: number;
  readonly eligiblePlayerIds: readonly string[];
}

export interface CardsAndPotsProps {
  readonly ownHoleCards: readonly string[] | null;
  readonly communityCards: readonly string[];
  readonly pots: readonly PotView[];
}

const suitSymbols: Record<string, string> = {
  c: '♣',
  d: '♦',
  h: '♥',
  s: '♠',
};

function PlayingCard({
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
  ownHoleCards,
  communityCards,
  pots,
}: CardsAndPotsProps) {
  let sidePotIndex = 0;
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

      <dl className="pot-list" aria-label="底池列表">
        {pots.map((pot, index) => {
          const label =
            index === 0
              ? '主池'
              : pot.eligiblePlayerIds.length < 2
                ? '待匹配'
                : `边池 ${++sidePotIndex}`;
          return (
            <div className="pot-chip" key={`${index}-${pot.amount}`}>
              <dt>{label}</dt>
              <dd>{pot.amount.toLocaleString('zh-CN')}</dd>
            </div>
          );
        })}
      </dl>

      <div className="hole-cards" aria-label="我的底牌">
        <PlayingCard code={ownHoleCards?.[0] ?? null} label="第一张底牌" />
        <PlayingCard code={ownHoleCards?.[1] ?? null} label="第二张底牌" />
      </div>
    </div>
  );
}
