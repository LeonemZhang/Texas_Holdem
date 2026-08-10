import {
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from 'react';

import {
  calculateDesktopCanvasOffsetY,
  calculateDesktopCanvasScale,
  DESKTOP_CANVAS_HEIGHT,
  DESKTOP_CANVAS_WIDTH,
  calculateMobileCanvasScale,
  shouldUseMobileTableLayout,
} from './DesktopCanvasScale.js';

export interface PokerTableLayoutProps {
  readonly roomName: string;
  readonly handLabel: string;
  readonly mobileHandLabel?: string;
  readonly seats: ReactNode;
  readonly communityCards: ReactNode;
  readonly actionTimer?: ReactNode;
  readonly tableOverlay?: ReactNode;
  readonly chipFlights?: ReactNode;
  readonly controls?: ReactNode;
  readonly status?: ReactNode;
  readonly utilityPanel?: ReactNode;
}

export function PokerTableLayout({
  roomName,
  handLabel,
  mobileHandLabel,
  seats,
  communityCards,
  actionTimer,
  tableOverlay,
  chipFlights,
  controls,
  status,
  utilityPanel,
}: PokerTableLayoutProps) {
  const pageRef = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page) return;

    const mediaQuery = window.matchMedia?.('(min-width: 600px)');
    const visualViewport = window.visualViewport;
    const updateScale = () => {
      const viewportWidth = visualViewport?.width ?? window.innerWidth;
      const viewportHeight = visualViewport?.height ?? window.innerHeight;
      const isDesktop = !shouldUseMobileTableLayout(
        viewportWidth,
        viewportHeight,
      );
      if (!isDesktop) {
        page.style.setProperty(
          '--mobile-canvas-scale',
          `${calculateMobileCanvasScale(viewportHeight)}`,
        );
        page.style.removeProperty('--desktop-canvas-scale');
        page.style.removeProperty('--desktop-canvas-offset-y');
        page.removeAttribute('data-desktop-scale-tier');
        return;
      }

      page.style.removeProperty('--mobile-canvas-scale');
      const { scale, tier } = calculateDesktopCanvasScale(
        viewportWidth,
        viewportHeight,
      );
      page.style.setProperty('--desktop-canvas-scale', `${scale}`);
      const offsetY = calculateDesktopCanvasOffsetY(viewportHeight, scale);
      page.style.setProperty('--desktop-canvas-offset-y', `${offsetY}px`);
      page.dataset.desktopScaleTier = tier;
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    visualViewport?.addEventListener('resize', updateScale);
    mediaQuery?.addEventListener?.('change', updateScale);

    return () => {
      window.removeEventListener('resize', updateScale);
      visualViewport?.removeEventListener('resize', updateScale);
      mediaQuery?.removeEventListener?.('change', updateScale);
    };
  }, []);

  return (
    <main
      ref={pageRef}
      className={`poker-table-page${utilityPanel ? ' poker-table-page--utility-open' : ''}`}
      style={
        {
          '--desktop-canvas-width': `${DESKTOP_CANVAS_WIDTH}px`,
          '--desktop-canvas-height': `${DESKTOP_CANVAS_HEIGHT}px`,
        } as CSSProperties
      }
    >
      <header className="poker-table-page__header">
        <h1 className="poker-table-page__room-name">{roomName}</h1>
        {status ? (
          <div className="poker-table-page__status">{status}</div>
        ) : null}
      </header>

      <div className="poker-table-page__workspace">
        <section className="poker-table" aria-label="德州牌桌">
          <div className="poker-table__seats" aria-label="玩家座位">
            {seats}
          </div>
          <div className="poker-table__felt">
            <div className="poker-table__game-bar">
              <div
                className="poker-table__game-status"
                aria-label="牌局进度"
                title={handLabel}
              >
                <span className="poker-table__game-status--desktop">
                  {handLabel}
                </span>
                {mobileHandLabel ? (
                  <span className="poker-table__game-status--mobile">
                    {mobileHandLabel}
                  </span>
                ) : null}
              </div>
              {actionTimer ?? (
                <span
                  className="poker-table__action-timer poker-table__action-timer--placeholder"
                  aria-hidden="true"
                />
              )}
            </div>
            <div className="poker-table__cards" aria-label="公共牌">
              {communityCards}
            </div>
          </div>
          {tableOverlay ? (
            <div className="poker-table__overlay">{tableOverlay}</div>
          ) : null}
          {chipFlights}
        </section>
        {utilityPanel ? (
          <aside
            className="poker-table-page__utility-panel"
            aria-label="牌桌工具面板"
          >
            {utilityPanel}
          </aside>
        ) : null}
      </div>

      {controls ? (
        <section className="poker-table-controls" aria-label="行动操作区">
          {controls}
        </section>
      ) : null}
    </main>
  );
}
