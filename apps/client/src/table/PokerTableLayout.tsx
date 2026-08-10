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
  MOBILE_CANVAS_BASE_HEIGHT,
  MOBILE_CANVAS_BASE_WIDTH,
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
  const controlsRef = useRef<HTMLElement | null>(null);

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
          `${calculateMobileCanvasScale(viewportWidth, viewportHeight)}`,
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

  useLayoutEffect(() => {
    const page = pageRef.current;
    const controlsElement = controlsRef.current;
    if (!page) return;
    if (!controlsElement) {
      page.style.removeProperty('--mobile-overlay-height');
      return;
    }

    const updateOverlayHeight = () => {
      const pageRect = page.getBoundingClientRect();
      const controlsRect = controlsElement.getBoundingClientRect();
      const scale =
        controlsElement.offsetWidth > 0
          ? controlsRect.width / controlsElement.offsetWidth
          : 1;
      const overlayHeight = Math.max(
        0,
        (controlsRect.top - pageRect.top) / Math.max(scale, 0.01),
      );
      page.style.setProperty('--mobile-overlay-height', `${overlayHeight}px`);
    };

    updateOverlayHeight();
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(updateOverlayHeight);
    resizeObserver?.observe(page);
    resizeObserver?.observe(controlsElement);
    window.addEventListener('resize', updateOverlayHeight);
    window.visualViewport?.addEventListener('resize', updateOverlayHeight);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('resize', updateOverlayHeight);
      window.visualViewport?.removeEventListener('resize', updateOverlayHeight);
    };
  }, [controls]);

  useLayoutEffect(() => {
    const page = pageRef.current;
    if (!page) return;

    let animationFrame: number | null = null;
    const updateCommunityCardsPosition = () => {
      const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
      const viewportHeight =
        window.visualViewport?.height ?? window.innerHeight;
      if (!shouldUseMobileTableLayout(viewportWidth, viewportHeight)) {
        page.style.removeProperty('--mobile-progress-center-shift-override');
        return;
      }

      const actingStreetBet = page.querySelector<HTMLElement>(
        '.table-seats__queue .table-seat--acting .table-seat__bets > span:last-child',
      );
      const holeCards = page.querySelector<HTMLElement>('.hole-cards');
      const publicCard = page.querySelector<HTMLElement>(
        '.community-cards .playing-card',
      );
      const felt = page.querySelector<HTMLElement>('.poker-table__felt');
      if (!actingStreetBet || !holeCards || !publicCard || !felt) {
        page.style.removeProperty('--mobile-progress-center-shift-override');
        return;
      }

      const betRect = actingStreetBet.getBoundingClientRect();
      const holeCardsRect = holeCards.getBoundingClientRect();
      const publicCardRect = publicCard.getBoundingClientRect();
      const pageRect = page.getBoundingClientRect();
      if (
        betRect.height <= 0 ||
        holeCardsRect.height <= 0 ||
        publicCardRect.height <= 0 ||
        pageRect.width <= 0
      ) {
        return;
      }

      const targetCenter = (betRect.bottom + holeCardsRect.top) / 2;
      const publicCardCenter = publicCardRect.top + publicCardRect.height / 2;
      const canvasScale =
        page.offsetWidth > 0 ? pageRect.width / page.offsetWidth : 1;
      const currentShift = Number.parseFloat(
        window
          .getComputedStyle(felt)
          .getPropertyValue('--mobile-progress-center-shift'),
      );
      const nextShift =
        (Number.isFinite(currentShift) ? currentShift : 0) +
        (targetCenter - publicCardCenter) / Math.max(canvasScale, 0.01);
      page.style.setProperty(
        '--mobile-progress-center-shift-override',
        `${nextShift}px`,
      );
    };

    const schedulePositionUpdate = () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = null;
        updateCommunityCardsPosition();
      });
    };

    schedulePositionUpdate();
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(schedulePositionUpdate);
    resizeObserver?.observe(page);
    window.addEventListener('resize', schedulePositionUpdate);
    window.visualViewport?.addEventListener('resize', schedulePositionUpdate);

    return () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      resizeObserver?.disconnect();
      window.removeEventListener('resize', schedulePositionUpdate);
      window.visualViewport?.removeEventListener(
        'resize',
        schedulePositionUpdate,
      );
    };
  }, [actionTimer, communityCards, handLabel, mobileHandLabel, seats]);

  return (
    <main
      ref={pageRef}
      className={`poker-table-page${utilityPanel ? ' poker-table-page--utility-open' : ''}`}
      style={
        {
          '--desktop-canvas-width': `${DESKTOP_CANVAS_WIDTH}px`,
          '--desktop-canvas-height': `${DESKTOP_CANVAS_HEIGHT}px`,
          '--mobile-canvas-width': `${MOBILE_CANVAS_BASE_WIDTH}px`,
          '--mobile-canvas-height': `${MOBILE_CANVAS_BASE_HEIGHT}px`,
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
        <section
          ref={controlsRef}
          className="poker-table-controls"
          aria-label="行动操作区"
        >
          {controls}
        </section>
      ) : null}
    </main>
  );
}
