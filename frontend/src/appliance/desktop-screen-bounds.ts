/**
 * Multi-Monitor & Multi-DPI screen work area resolution for Echo OS desktop windows.
 *
 * Synchronizes with Electron's physical display bounds via screen.getDisplayMatching,
 * allowing seamless window dragging across secondary monitors with negative coordinates
 * and high-DPI scaling. Degrades gracefully in web browsers.
 */

export interface ScreenWorkArea {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
}

export const DEFAULT_WORK_AREA: ScreenWorkArea = {
  x: 0,
  y: 0,
  width: typeof window !== "undefined" ? window.innerWidth : 1920,
  height: typeof window !== "undefined" ? window.innerHeight : 1080,
  scaleFactor:
    typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1,
};

let cachedWorkArea: ScreenWorkArea | null = null;
let lastFetchTime = 0;

/**
 * Resolves the physical or virtual work area rectangle for multi-monitor and multi-DPI setups.
 */
export async function getDesktopWorkArea(
  forceRefresh = false,
): Promise<ScreenWorkArea> {
  if (typeof window === "undefined") return DEFAULT_WORK_AREA;

  const now = performance.now();
  if (!forceRefresh && cachedWorkArea && now - lastFetchTime < 1000) {
    return cachedWorkArea;
  }

  if (window.echo?.window?.getScreenBounds) {
    try {
      const res = await window.echo.window.getScreenBounds();
      if (res.ok && res.workArea) {
        cachedWorkArea = {
          x: res.workArea.x,
          y: res.workArea.y,
          width: res.workArea.width,
          height: res.workArea.height,
          scaleFactor: res.scaleFactor || window.devicePixelRatio || 1,
        };
        lastFetchTime = now;
        return cachedWorkArea;
      }
    } catch {
      // Fallback to DOM window dimensions
    }
  }

  cachedWorkArea = {
    x: 0,
    y: 0,
    width: window.innerWidth,
    height: window.innerHeight,
    scaleFactor: window.devicePixelRatio || 1,
  };
  lastFetchTime = now;
  return cachedWorkArea;
}

/**
 * Synchronous snapshot of current work area with safe default fallback.
 */
export function getDesktopWorkAreaSync(): ScreenWorkArea {
  if (typeof window === "undefined") return DEFAULT_WORK_AREA;
  if (cachedWorkArea) return cachedWorkArea;
  return {
    x: 0,
    y: 0,
    width: window.innerWidth,
    height: window.innerHeight,
    scaleFactor: window.devicePixelRatio || 1,
  };
}

/**
 * Clamps coordinates [x, y] to ensure an element of [width, height] remains within safe work area.
 */
export function clampToWorkArea(
  x: number,
  y: number,
  width: number,
  height: number,
  workArea: ScreenWorkArea = getDesktopWorkAreaSync(),
  margin = 12,
): { x: number; y: number } {
  const minX = workArea.x + margin;
  const maxX = Math.max(minX, workArea.x + workArea.width - width - margin);
  const minY = workArea.y + margin;
  const maxY = Math.max(minY, workArea.y + workArea.height - height - margin);

  return {
    x: Math.round(Math.max(minX, Math.min(maxX, x))),
    y: Math.round(Math.max(minY, Math.min(maxY, y))),
  };
}
