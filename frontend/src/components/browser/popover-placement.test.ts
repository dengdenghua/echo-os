import { describe, expect, it } from "vitest";

import { placePopoverWithin } from "./popover-placement";

// A 900px-tall window body from y=100 to y=800; the anchor grid is 300px tall.
const base = {
  anchorHeight: 300,
  boundaryTop: 100,
  boundaryBottom: 800,
};

describe("placePopoverWithin", () => {
  it("opens below the anchor when the popover fits", () => {
    expect(
      placePopoverWithin({ ...base, anchorTop: 150, popoverHeight: 200 }),
    ).toEqual({ top: 308 });
  });

  it("moves up to end inside the window instead of being clipped", () => {
    // Below would end at 400 + 308 + 260 = 968, past the 800 edge.
    const { top, maxHeight } = placePopoverWithin({
      ...base,
      anchorTop: 400,
      popoverHeight: 260,
    });
    expect(maxHeight).toBeUndefined();
    expect(400 + top + 260).toBe(800 - 12);
  });

  it("never rises above the window's top edge", () => {
    const { top } = placePopoverWithin({
      ...base,
      anchorTop: 120,
      popoverHeight: 670,
    });
    expect(120 + top).toBeGreaterThanOrEqual(100 + 12);
  });

  it("caps a popover taller than the window so it scrolls", () => {
    expect(
      placePopoverWithin({ ...base, anchorTop: 400, popoverHeight: 900 }),
    ).toEqual({ top: 100 + 12 - 400, maxHeight: 700 - 24 });
  });
});
