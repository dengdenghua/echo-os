import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clampToWorkArea,
  getDesktopWorkArea,
  getDesktopWorkAreaSync,
  type ScreenWorkArea,
} from "./desktop-screen-bounds";

describe("desktop-screen-bounds", () => {
  beforeEach(() => {
    delete (window as unknown as { echo?: unknown }).echo;
  });

  it("clamps coordinates safely within primary monitor bounds", () => {
    const workArea: ScreenWorkArea = {
      x: 0,
      y: 0,
      width: 1920,
      height: 1080,
      scaleFactor: 1,
    };

    // Normal position inside bounds
    expect(clampToWorkArea(500, 300, 400, 300, workArea)).toEqual({
      x: 500,
      y: 300,
    });

    // Beyond top-left
    expect(clampToWorkArea(-50, -20, 400, 300, workArea, 10)).toEqual({
      x: 10,
      y: 10,
    });

    // Beyond bottom-right
    expect(clampToWorkArea(1800, 1000, 400, 300, workArea, 10)).toEqual({
      x: 1920 - 400 - 10,
      y: 1080 - 300 - 10,
    });
  });

  it("supports multi-monitor setup with negative coordinates on secondary screen", () => {
    // Secondary monitor placed to the left of the primary screen (-1920 to 0)
    const secondaryWorkArea: ScreenWorkArea = {
      x: -1920,
      y: 0,
      width: 1920,
      height: 1080,
      scaleFactor: 1.25,
    };

    const clamped = clampToWorkArea(-1500, 200, 500, 400, secondaryWorkArea, 12);
    expect(clamped.x).toBe(-1500);
    expect(clamped.y).toBe(200);

    // Beyond secondary left edge
    const clampedBeyond = clampToWorkArea(
      -2100,
      -50,
      500,
      400,
      secondaryWorkArea,
      12,
    );
    expect(clampedBeyond.x).toBe(-1920 + 12);
    expect(clampedBeyond.y).toBe(12);
  });

  it("queries Electron IPC getScreenBounds when available", async () => {
    const mockGetScreenBounds = vi.fn().mockResolvedValue({
      ok: true,
      workArea: { x: 0, y: 30, width: 2560, height: 1410 },
      scaleFactor: 2,
    });

    (window as unknown as { echo: { window: { getScreenBounds: typeof mockGetScreenBounds } } }).echo = {
      window: {
        getScreenBounds: mockGetScreenBounds,
      },
    };

    const area = await getDesktopWorkArea(true);
    expect(mockGetScreenBounds).toHaveBeenCalled();
    expect(area.width).toBe(2560);
    expect(area.height).toBe(1410);
    expect(area.scaleFactor).toBe(2);

    // Synchronous getter returns cached value
    expect(getDesktopWorkAreaSync().width).toBe(2560);
  });
});
