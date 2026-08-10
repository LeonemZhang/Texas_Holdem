export const DESKTOP_CANVAS_WIDTH = 1460;
export const DESKTOP_CANVAS_HEIGHT = 821;
export const DESKTOP_CANVAS_MIN_SCALE = 0.4;
export const DESKTOP_CANVAS_MAX_SCALE = 1.75;
export const MOBILE_CANVAS_BASE_WIDTH = 390;
export const MOBILE_CANVAS_BASE_HEIGHT = 720;
export const MOBILE_CANVAS_MIN_SCALE = 0.5;
/** Viewports at or above this height-to-width ratio use the mobile table. */
export const MOBILE_TABLE_MIN_HEIGHT_WIDTH_RATIO = 1.2;

export type DesktopCanvasScaleTier = 'compact' | 'base' | '1080p' | '1440p';

export interface DesktopCanvasScale {
  readonly scale: number;
  readonly tier: DesktopCanvasScaleTier;
}

export function shouldUseMobileTableLayout(
  viewportWidth: number,
  viewportHeight: number,
): boolean {
  if (viewportWidth < 600) return true;
  return (
    viewportHeight / Math.max(viewportWidth, 1) >=
    MOBILE_TABLE_MIN_HEIGHT_WIDTH_RATIO
  );
}

/**
 * Mobile uses a fixed 390 x 720 design canvas and scales the complete page to
 * the largest size that fits both viewport dimensions. This keeps the hand,
 * board, seats, and action controls in one coordinate system instead of letting
 * one region consume the others' space.
 */
export function calculateMobileCanvasScale(
  viewportWidth: number,
  viewportHeight: number,
): number {
  if (
    !Number.isFinite(viewportWidth) ||
    viewportWidth <= 0 ||
    !Number.isFinite(viewportHeight) ||
    viewportHeight <= 0
  ) {
    return 1;
  }

  return Math.max(
    MOBILE_CANVAS_MIN_SCALE,
    Math.min(
      viewportWidth / MOBILE_CANVAS_BASE_WIDTH,
      viewportHeight / MOBILE_CANVAS_BASE_HEIGHT,
    ),
  );
}

export function calculateDesktopCanvasOffsetY(
  viewportHeight: number,
  scale: number,
): number {
  if (scale <= 0) return 0;

  // Center the rendered (zoomed) canvas, not its unscaled layout box. When
  // it cannot fit, keep it at the top and let the page provide scrolling.
  return Math.max(
    0,
    (viewportHeight - DESKTOP_CANVAS_HEIGHT * scale) / (2 * scale),
  );
}

export function calculateDesktopCanvasScale(
  viewportWidth: number,
  viewportHeight: number,
): DesktopCanvasScale {
  const rawScale = Math.min(
    viewportWidth / DESKTOP_CANVAS_WIDTH,
    viewportHeight / DESKTOP_CANVAS_HEIGHT,
  );
  const scale = Math.min(
    DESKTOP_CANVAS_MAX_SCALE,
    Math.max(DESKTOP_CANVAS_MIN_SCALE, rawScale),
  );
  const tier =
    rawScale < 1
      ? 'compact'
      : rawScale < 1.2
        ? 'base'
        : rawScale < 1.55
          ? '1080p'
          : '1440p';

  return { scale, tier };
}
