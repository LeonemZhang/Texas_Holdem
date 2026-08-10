import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PokerTableLayout } from './PokerTableLayout.js';
import {
  calculateDesktopCanvasScale,
  calculateDesktopCanvasOffsetY,
  DESKTOP_CANVAS_WIDTH,
  calculateMobileCanvasScale,
  MOBILE_CANVAS_BASE_WIDTH,
  MOBILE_CANVAS_BASE_HEIGHT,
  shouldUseMobileTableLayout,
} from './DesktopCanvasScale.js';

describe('PokerTableLayout', () => {
  it.each([
    [1180, 821, 1180 / DESKTOP_CANVAS_WIDTH, 'compact'],
    [1460, 821, 1, 'base'],
    [1920, 1080, 1920 / DESKTOP_CANVAS_WIDTH, '1080p'],
    [2560, 1440, 1.75, '1440p'],
    [960, 600, 960 / DESKTOP_CANVAS_WIDTH, 'compact'],
  ])(
    'calculates the %s x %s desktop canvas scale and tier',
    (width, height, expectedScale, expectedTier) => {
      expect(calculateDesktopCanvasScale(width, height)).toEqual({
        scale: expect.closeTo(expectedScale, 6),
        tier: expectedTier,
      });
    },
  );

  it.each([
    [390, 720, 1],
    [414, 720, 1],
    [360, 600, 600 / MOBILE_CANVAS_BASE_HEIGHT],
    [390, 480, 480 / MOBILE_CANVAS_BASE_HEIGHT],
    [0, 720, 1],
  ])(
    'scales the mobile canvas from the %s x %s baseline',
    (width, height, expected) => {
      expect(calculateMobileCanvasScale(width, height)).toBeCloseTo(
        expected,
        6,
      );
    },
  );

  it('keeps the mobile scale baseline explicit', () => {
    expect(MOBILE_CANVAS_BASE_WIDTH).toBe(390);
    expect(MOBILE_CANVAS_BASE_HEIGHT).toBe(720);
  });

  it.each([
    [1024, 1366, true],
    [768, 1024, true],
    [1180, 821, false],
    [1024, 768, false],
    [390, 844, true],
  ])(
    'switches to the mobile table when the viewport is portrait enough (%s x %s)',
    (width, height, expected) => {
      expect(shouldUseMobileTableLayout(width, height)).toBe(expected);
    },
  );

  it.each([
    [601, 877 / DESKTOP_CANVAS_WIDTH, 89.762258],
    [600, 960 / DESKTOP_CANVAS_WIDTH, 45.75],
    [1024, 1366 / DESKTOP_CANVAS_WIDTH, 136.732796],
    [821, 1180 / DESKTOP_CANVAS_WIDTH, 97.40678],
    [1000, 1600 / DESKTOP_CANVAS_WIDTH, 45.75],
    [821, 1, 0],
    [300, 0.4, 0],
  ])(
    'centers the rendered desktop canvas while preserving a top fallback',
    (viewportHeight, scale, expectedOffset) => {
      expect(calculateDesktopCanvasOffsetY(viewportHeight, scale)).toBeCloseTo(
        expectedOffset,
        5,
      );
    },
  );

  it('keeps the four gameplay regions explicit and accessible', () => {
    render(
      <PokerTableLayout
        roomName="朋友局"
        handLabel="第 8 局 · 翻牌前 · 盲注：1/2 · 当前行动：Alice"
        mobileHandLabel="第 8 局 · 翻牌前 · 盲注：1/2"
        seats={<span>Alice 的座位</span>}
        communityCards={<span>翻牌</span>}
        actionTimer={<span>轮到 Alice · 18s</span>}
        controls={<button>过牌</button>}
        status={<span>轮到 Alice</span>}
        utilityPanel={<section>筹码交换内容</section>}
      />,
    );

    expect(screen.getByRole('heading', { name: '朋友局' })).toBeInTheDocument();
    const gameStatus = screen.getByLabelText('牌局进度');
    expect(gameStatus).toHaveTextContent(
      '第 8 局 · 翻牌前 · 盲注：1/2 · 当前行动：Alice',
    );
    expect(gameStatus).toHaveAttribute(
      'title',
      '第 8 局 · 翻牌前 · 盲注：1/2 · 当前行动：Alice',
    );
    expect(
      gameStatus.querySelector('.poker-table__game-status--mobile'),
    ).toHaveTextContent('第 8 局 · 翻牌前 · 盲注：1/2');
    expect(
      gameStatus.querySelector('.poker-table__game-status--mobile'),
    ).not.toHaveTextContent('当前行动');
    expect(gameStatus.closest('.poker-table__felt')).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('玩家座位')).getByText('Alice 的座位'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByLabelText('公共牌')).getByText('翻牌'),
    ).toBeInTheDocument();
    expect(screen.getByText('轮到 Alice · 18s')).toBeInTheDocument();
    expect(screen.getByLabelText('牌桌工具面板')).toHaveTextContent(
      '筹码交换内容',
    );
    expect(document.querySelector('.poker-table-page')).toHaveClass(
      'poker-table-page--utility-open',
    );
    expect(
      within(screen.getByLabelText('行动操作区')).getByRole('button', {
        name: '过牌',
      }),
    ).toBeInTheDocument();
    expect(document.querySelector('.poker-table-page')).toHaveStyle(
      `--desktop-canvas-width: ${DESKTOP_CANVAS_WIDTH}px`,
    );
    expect(document.querySelector('.poker-table-page')).toHaveStyle(
      '--desktop-canvas-height: 821px',
    );
  });

  it('uses containment classes and omits controls when there is no active action', () => {
    const { container } = render(
      <PokerTableLayout
        roomName="朋友局"
        handLabel="等待中"
        seats={null}
        communityCards={null}
        controls={null}
      />,
    );
    expect(container.querySelector('.poker-table-page')).toBeInTheDocument();
    expect(
      container.querySelector('.poker-table-page__workspace'),
    ).toBeInTheDocument();
    expect(container.querySelector('.poker-table__felt')).toBeInTheDocument();
    expect(
      container.querySelector('.poker-table__action-timer--placeholder'),
    ).toBeInTheDocument();
    expect(container.querySelector('.poker-table-controls')).toBeNull();
  });
});
