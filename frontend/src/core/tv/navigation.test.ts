import { describe, expect, it } from "vitest";
import { isRemoteBack, nextFocusIndex, remoteDirection } from "./navigation";

const box = (left: number, top: number, width = 100, height = 60) => ({
  left,
  top,
  width,
  height,
});
describe("TV directional focus", () => {
  it("keeps horizontal navigation on its row even beside a closer diagonal item", () => {
    expect(
      nextFocusIndex(
        box(0, 0),
        [box(150, 0), box(55, 80), box(-150, 0)],
        "right",
      ),
    ).toBe(0);
  });
  it("moves vertically to an aligned card instead of a different column", () => {
    expect(
      nextFocusIndex(box(150, 0), [box(0, 70), box(130, 120)], "down"),
    ).toBe(1);
  });
  it("does not wrap at the edge or choose itself", () => {
    expect(nextFocusIndex(box(0, 0), [box(0, 0), box(150, 0)], "left")).toBe(
      -1,
    );
  });
  it("can leave a row through a diagonal target when none is aligned", () => {
    expect(nextFocusIndex(box(0, 0), [box(200, 100)], "down")).toBe(0);
  });
  it("normalizes standard remote and keyboard input without capturing text", () => {
    expect(remoteDirection("ArrowDown")).toBe("down");
    expect(remoteDirection("a")).toBeNull();
    expect(isRemoteBack("BrowserBack")).toBe(true);
    expect(isRemoteBack("Enter")).toBe(false);
  });
});
