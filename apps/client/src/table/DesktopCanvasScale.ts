export const DESKTOP_CANVAS_WIDTH = 1460;
export const DESKTOP_CANVAS_HEIGHT = 821;
export const DESKTOP_CANVAS_MIN_SCALE = 0.4;
export const DESKTOP_CANVAS_MAX_SCALE = 1.75;
export const MOBILE_CANVAS_BASE_HEIGHT = 640;
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
 * Mobile keeps one stable, readable table height and scales the complete page
 * when the viewport is shorter than that baseline. This keeps the hand, board,
 * seats, and action controls in the same coordinate system instead of letting
 * one region consume the others' space.
 */
export function calculateMobileCanvasScale(viewportHeight: number): number {
  if (!Number.isFinite(viewportHeight) || viewportHeight <= 0) {
    return 1;
  }

  return Math.min(
    1,
    Math.max(
      MOBILE_CANVAS_MIN_SCALE,
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
