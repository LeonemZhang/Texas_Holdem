import { useEffect, useState, type ReactNode } from 'react';

import { UtilityPanelHeader, UtilityTabs } from '../room/UtilityPanel.js';
import { sortBestFiveCards } from '../room/HandReadyOverlay.js';
import { PlayingCard } from '../table/CardsAndPots.js';

export interface PlayerStatisticsView {
  readonly playerId: string;
  readonly nickname: string;
  readonly removed?: boolean | undefined;
  readonly initialChips: number;
  readonly currentChips: number;
  readonly netWinLoss: number;
  readonly participatedHands: number;
  readonly wonHands: number;
  readonly largestSingleHandProfit: number;
  readonly largestSingleHandLoss: number;
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
export interface HandPeaksView {
  readonly global: {
    readonly handType: string;
    readonly playerIds: readonly string[];
    readonly bestFiveCards: readonly string[];
  } | null;
  readonly players: readonly {
    readonly playerId: string;
    readonly handType: string;
    readonly bestFiveCards: readonly string[];
  }[];
  readonly hasLegacyCoverageGap: boolean;
}

export interface StatisticsPanelProps {
  readonly open: boolean;
  readonly collapsed?: boolean;
  readonly players: readonly PlayerStatisticsView[];
  readonly titles: readonly FunTitleView[];
  readonly handPeaks?: HandPeaksView | undefined;
  readonly onCollapse: () => void;
  readonly onExpand?: () => void;
  readonly presentation?: 'drawer' | 'modal';
  readonly summary?: ReactNode;
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
const titleRules: Record<string, string> = {
  'all-in-king': '全押次数最多。',
  'unlucky-player': '进入 1 对 1 摊牌后落败次数最多。',
  'pot-harvester': '累计赢得底池筹码最多。',
  'double-up-master': '单手净盈利最高。',
  'bluff-king': '未进入摊牌便赢得底池次数最多。',
  'river-killer': '河牌完成反超并获胜次数最多。',
  'tight-player': '至少参与 10 手后，翻牌前弃牌比例最高。',
};
const handTypeNames: Record<string, string> = {
  'high-card': '高牌',
  'one-pair': '一对',
  'two-pair': '两对',
  'three-of-a-kind': '三条',
  straight: '顺子',
  flush: '同花',
  'full-house': '葫芦',
  'four-of-a-kind': '四条',
  'straight-flush': '同花顺',
};

function HandCards({
  cards,
  label,
}: {
  readonly cards: readonly string[];
  readonly label: string;
}) {
  return (
    <div className="statistics-hand-cards" aria-label={label}>
      {cards.map((card, index) => (
        <PlayingCard
          key={`${card}-${index}`}
          code={card}
          label={`${label}第 ${index + 1} 张`}
        />
      ))}
    </div>
  );
}

export function StatisticsPanel({
  open,
  collapsed = false,
  players,
  titles,
  handPeaks = { global: null, players: [], hasLegacyCoverageGap: false },
  onCollapse,
  onExpand,
  presentation = 'drawer',
  summary,
}: StatisticsPanelProps) {
  const [activeTab, setActiveTab] = useState<'statistics' | 'titles' | 'hands'>(
    'statistics',
  );
  const [ruleTitle, setRuleTitle] = useState<string | null>(null);
  useEffect(() => {
    if (presentation !== 'modal' || !open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCollapse();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCollapse, open, presentation]);
  if (!open) return null;
  if (collapsed)
    return (
      <aside className="statistics-tab" aria-label="已收起的统计">
        <button type="button" onClick={onExpand}>
          统计
        </button>
      </aside>
    );
  const ranked = [...players].sort((left, right) => {
    const removedOrder =
      Number(Boolean(left.removed)) - Number(Boolean(right.removed));
    return removedOrder || right.currentChips - left.currentChips;
  });
  const nicknames = new Map(
    players.map((player) => [player.playerId, player.nickname]),
  );
  const peakByPlayer = new Map(
    handPeaks.players.map((peak) => [peak.playerId, peak]),
  );
  const content = (
    <aside
      className={`statistics-drawer${presentation === 'modal' ? ' statistics-drawer--modal' : ''}`}
      aria-labelledby="statistics-title"
      role={presentation === 'modal' ? 'dialog' : undefined}
      aria-modal={presentation === 'modal' || undefined}
    >
      <UtilityPanelHeader
        kicker="服务端统计"
        title="牌局战报"
        titleId="statistics-title"
        summary={summary}
        onCollapse={onCollapse}
        collapseLabel={presentation === 'modal' ? '关闭' : '收起'}
      />
      <UtilityTabs
        label="牌局战报视图"
        activeTab={activeTab}
        onChange={(tab) => setActiveTab(tab as typeof activeTab)}
        tabs={[
          { id: 'statistics', label: '牌局统计' },
          { id: 'titles', label: '局内称号' },
          { id: 'hands', label: '牌型记录' },
        ]}
      />
      {activeTab === 'statistics' ? (
        <ol
          id="statistics-panel"
          className="statistics-ranking"
          role="tabpanel"
          aria-labelledby="statistics-tab"
          aria-label="筹码排名"
        >
          {ranked.map((player, index) => (
            <li key={player.playerId}>
              <strong>
                #{index + 1} {player.nickname}
              </strong>
              <span>{player.currentChips.toLocaleString('zh-CN')} 筹码</span>
              <dl>
                <div className="statistics-ranking__net-win-loss">
                  <dt>净输赢（不含交换筹码）</dt>
                  <dd
                    className={
                      player.netWinLoss >= 0
                        ? 'statistics-positive'
                        : 'statistics-negative'
                    }
                  >
                    {player.netWinLoss >= 0 ? '+' : ''}
                    {player.netWinLoss.toLocaleString('zh-CN')}
                  </dd>
                </div>
                <div>
                  <dt>参与/获胜</dt>
                  <dd>
                    {player.participatedHands}/{player.wonHands}
                  </dd>
                </div>
                <div>
                  <dt>最大单局盈利</dt>
                  <dd>{player.largestSingleHandProfit}</dd>
                </div>
                <div>
                  <dt>最大单局输掉</dt>
                  <dd>{player.largestSingleHandLoss}</dd>
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
      ) : null}
      {activeTab === 'titles' ? (
        <section
          id="titles-panel"
          className="fun-titles"
          role="tabpanel"
          aria-labelledby="titles-tab"
        >
          <ul>
            {titles.map((award) => (
              <li key={award.title}>
                <strong className="fun-titles__title">
                  <span>{titleNames[award.title] ?? award.title}</span>
                  <button
                    type="button"
                    className="fun-titles__help"
                    aria-label={`说明：${titleNames[award.title] ?? award.title}`}
                    aria-expanded={ruleTitle === award.title}
                    aria-describedby={
                      ruleTitle === award.title
                        ? `title-rule-${award.title}`
                        : undefined
                    }
                    onClick={() =>
                      setRuleTitle(
                        ruleTitle === award.title ? null : award.title,
                      )
                    }
                  >
                    ?
                  </button>
                  {ruleTitle === award.title ? (
                    <span
                      id={`title-rule-${award.title}`}
                      className="fun-titles__popover"
                      role="tooltip"
                    >
                      {titleRules[award.title] ?? '由服务端已确认事件计算。'}
                    </span>
                  ) : null}
                </strong>
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
      ) : null}
      {activeTab === 'hands' ? (
        <section
          id="hands-panel"
          className="statistics-hands"
          role="tabpanel"
          aria-labelledby="hands-tab"
        >
          {handPeaks.hasLegacyCoverageGap ? (
            <p className="statistics-hands__notice">
              历史牌型从版本更新后开始记录。
            </p>
          ) : null}
          {handPeaks.global ? (
            <section
              className="statistics-hands__global"
              aria-label="本局最高牌型"
            >
              <p>本局最高牌型</p>
              <strong>
                {handTypeNames[handPeaks.global.handType] ??
                  handPeaks.global.handType}
              </strong>
              <span>
                归属：
                {handPeaks.global.playerIds
                  .map((id) => nicknames.get(id) ?? id)
                  .join('、')}
              </span>
              <HandCards
                cards={sortBestFiveCards(
                  handPeaks.global.bestFiveCards,
                  handTypeNames[handPeaks.global.handType] ??
                    handPeaks.global.handType,
                )}
                label="本局最高牌型"
              />
            </section>
          ) : (
            <p className="statistics-hands__empty">暂无可评估牌型。</p>
          )}
          <ul>
            {players.map((player) => {
              const peak = peakByPlayer.get(player.playerId);
              return (
                <li key={player.playerId} className="statistics-hands__player">
                  <strong>{player.nickname}</strong>
                  {peak ? (
                    <>
                      <span>
                        {handTypeNames[peak.handType] ?? peak.handType}
                      </span>
                      <HandCards
                        cards={sortBestFiveCards(
                          peak.bestFiveCards,
                          handTypeNames[peak.handType] ?? peak.handType,
                        )}
                        label={`${player.nickname} 的最高牌型`}
                      />
                    </>
                  ) : (
                    <small>暂无可评估牌型</small>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </aside>
  );
  return presentation === 'modal' ? (
    <div
      className="modal-backdrop statistics-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCollapse();
      }}
    >
      {content}
    </div>
  ) : (
    content
  );
}
