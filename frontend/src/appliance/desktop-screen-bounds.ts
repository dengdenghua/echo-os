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

// 视口尺寸变化后旧的工作区不再可信；下次读取时重新取值。
if (typeof window !== "undefined") {
  window.addEventListener("resize", () => {
    cachedWorkArea = null;
  });
}

type ScreenRect = { x: number; y: number; width: number; height: number };

/**
 * Electron 返回的是屏幕坐标，窗口定位用的是页面坐标。减去内容区原点，再与
 * 视口求交，副屏、负坐标和非全屏窗口下都能得到页面内真实可用的区域。
 */
function toClientWorkArea(
  workArea: ScreenRect,
  origin: { x: number; y: number } | undefined,
): ScreenRect {
  if (!origin) return workArea;
  const left = Math.max(0, workArea.x - origin.x);
  const top = Math.max(0, workArea.y - origin.y);
  const right = Math.min(window.innerWidth, workArea.x + workArea.width - origin.x);
  const bottom = Math.min(
    window.innerHeight,
    workArea.y + workArea.height - origin.y,
  );
  if (right - left < 200 || bottom - top < 200) {
    return { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight };
  }
  return { x: left, y: top, width: right - left, height: bottom - top };
}

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
        const area = toClientWorkArea(
          res.workArea,
          res.contentBounds ?? res.windowBounds,
        );
        cachedWorkArea = {
          ...area,
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
