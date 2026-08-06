import type { KeyboardEvent, ReactNode } from 'react';

export interface UtilityTab {
  readonly id: string;
  readonly label: string;
  readonly badge?: number;
}

export function UtilityPanelHeader({
  kicker,
  title,
  titleId,
  summary,
  onCollapse,
  collapseLabel = '收起',
}: {
  readonly kicker: string;
  readonly title: string;
  readonly titleId: string;
  readonly summary?: ReactNode;
  readonly onCollapse: () => void;
  readonly collapseLabel?: string;
}) {
  return (
    <header className="utility-panel-header">
      <div>
        <p className="connection-home__kicker">{kicker}</p>
        <h2 id={titleId}>{title}</h2>
        {summary ? (
          <div className="utility-panel-header__summary">{summary}</div>
        ) : null}
      </div>
      <button
        className="button button--secondary utility-panel-header__collapse"
        type="button"
        onClick={onCollapse}
      >
        {collapseLabel}
      </button>
    </header>
  );
}

export function UtilityTabs({
  tabs,
  activeTab,
  onChange,
  label,
}: {
  readonly tabs: readonly UtilityTab[];
  readonly activeTab: string;
  readonly onChange: (tabId: string) => void;
  readonly label: string;
}) {
  const activateByOffset = (
    event: KeyboardEvent<HTMLButtonElement>,
    offset: number,
  ) => {
    const current = tabs.findIndex(({ id }) => id === activeTab);
    const next = tabs[(current + offset + tabs.length) % tabs.length];
    if (!next) return;
    event.preventDefault();
    onChange(next.id);
    const list = event.currentTarget.parentElement;
    const nextIndex = tabs.findIndex(({ id }) => id === next.id);
    requestAnimationFrame(() =>
      list
        ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
        .item(nextIndex)
        .focus(),
    );
  };
  return (
    <div className="utility-tabs" role="tablist" aria-label={label}>
      {tabs.map((tab) => (
        <button
          id={`${tab.id}-tab`}
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={activeTab === tab.id}
          aria-controls={`${tab.id}-panel`}
          tabIndex={activeTab === tab.id ? 0 : -1}
          onClick={() => onChange(tab.id)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') activateByOffset(event, 1);
            if (event.key === 'ArrowLeft') activateByOffset(event, -1);
            if (event.key === 'Home') {
              event.preventDefault();
              onChange(tabs[0]!.id);
            }
            if (event.key === 'End') {
              event.preventDefault();
              onChange(tabs.at(-1)!.id);
            }
          }}
        >
          {tab.label}
          {tab.badge ? <span>{tab.badge}</span> : null}
        </button>
      ))}
    </div>
  );
}
