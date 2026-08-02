export interface PlayerStatisticsView {
  readonly playerId: string;
  readonly nickname: string;
  readonly initialChips: number;
  readonly currentChips: number;
  readonly participatedHands: number;
  readonly wonHands: number;
  readonly largestSingleHandProfit: number;
  readonly largestWonPot: number;
  readonly showdownCount: number;
  readonly showdownWinRate: number | null;
  readonly actions: {
    readonly fold: number;
    readonly check: number;
    readonly call: number;
    readonly raiseTo: number;
    readonly allIn: number;
  };
}

export interface FunTitleView {
  readonly title: string;
  readonly playerIds: readonly string[];
  readonly value: number | null;
}

export interface StatisticsPanelProps {
  readonly open: boolean;
  readonly players: readonly PlayerStatisticsView[];
  readonly titles: readonly FunTitleView[];
  readonly onClose: () => void;
}

const titleNames: Record<string, string> = {
  'all-in-king': 'All-in 之王',
  'unlucky-player': '倒霉蛋',
  'pot-harvester': '底池收割机',
  'double-up-master': '翻倍大师',
  'bluff-king': '偷鸡王',
  'river-killer': '河牌杀手',
  'tight-player': '铁公鸡',
};

export function StatisticsPanel({
  open,
  players,
  titles,
  onClose,
}: StatisticsPanelProps) {
  if (!open) return null;
  const ranked = [...players].sort(
    (left, right) => right.currentChips - left.currentChips,
  );
  const nicknames = new Map(
    players.map((player) => [player.playerId, player.nickname]),
  );

  return (
    <aside className="statistics-drawer" aria-labelledby="statistics-title">
      <header>
        <div>
          <p className="connection-home__kicker">服务端统计</p>
          <h2 id="statistics-title">牌局战报</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="关闭统计">
          ×
        </button>
      </header>

      <ol className="statistics-ranking" aria-label="筹码排名">
        {ranked.map((player, index) => (
          <li key={player.playerId}>
            <strong>
              #{index + 1} {player.nickname}
            </strong>
            <span>{player.currentChips.toLocaleString('zh-CN')}</span>
            <small
              className={
                player.currentChips - player.initialChips >= 0
                  ? 'statistics-positive'
                  : 'statistics-negative'
              }
            >
              {player.currentChips - player.initialChips >= 0 ? '+' : ''}
              {player.currentChips - player.initialChips}
            </small>
            <dl>
              <div>
                <dt>参与/获胜</dt>
                <dd>
                  {player.participatedHands}/{player.wonHands}
                </dd>
              </div>
              <div>
                <dt>最大单手盈利</dt>
                <dd>{player.largestSingleHandProfit}</dd>
              </div>
              <div>
                <dt>最大底池</dt>
                <dd>{player.largestWonPot}</dd>
              </div>
              <div>
                <dt>摊牌胜率</dt>
                <dd>
                  {player.showdownWinRate === null
                    ? '—'
                    : `${Math.round(player.showdownWinRate * 100)}% (${player.showdownCount} 次)`}
                </dd>
              </div>
              <div className="statistics-ranking__actions">
                <dt>弃 / 过 / 跟 / 加 / 全押</dt>
                <dd>
                  {player.actions.fold} / {player.actions.check} /{' '}
                  {player.actions.call} / {player.actions.raiseTo} /{' '}
                  {player.actions.allIn}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ol>

      <section className="fun-titles" aria-labelledby="fun-titles-title">
        <h3 id="fun-titles-title">局内称号</h3>
        <ul>
          {titles.map((award) => (
            <li key={award.title}>
              <strong>{titleNames[award.title] ?? award.title}</strong>
              <span>
                {award.playerIds.length === 0
                  ? '暂未产生'
                  : award.playerIds
                      .map((id) => nicknames.get(id) ?? id)
                      .join('、')}
              </span>
              <small>{award.value === null ? '—' : award.value}</small>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
